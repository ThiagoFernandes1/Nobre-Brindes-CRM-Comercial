import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { SellerDigest } from '../../src/automation/digest.js';
import { runFollowUpJob } from '../../src/automation/follow-up-job.js';
import type { Notifier } from '../../src/automation/notifier.js';
import { config } from '../../src/config.js';
import { migrate } from '../../src/db/migrate.js';
import { createPool, type Db } from '../../src/db/pool.js';
import { seedDatabase } from '../../src/db/seed.js';

const TODAY = '2026-10-15';
const databaseUrl = config.DATABASE_URL_TEST;

class FakeNotifier implements Notifier {
  readonly channel = 'fake';
  sent: SellerDigest[] = [];
  async send(digest: SellerDigest) {
    this.sent.push(digest);
  }
}

describe.skipIf(!databaseUrl)('API + PostgreSQL', () => {
  let db: Db;
  let app: FastifyInstance;
  const notifier = new FakeNotifier();

  beforeAll(async () => {
    db = createPool(databaseUrl!);
    await migrate(db, { reset: true });
    app = await buildApp({ db, today: () => TODAY, notifier });
  });

  afterAll(async () => {
    await app?.close();
    await db?.end();
  });

  beforeEach(async () => {
    notifier.sent = [];
    await seedDatabase(db);
  });

  async function idOf(code: string): Promise<number> {
    const { rows } = await db.query<{ id: number }>('SELECT id FROM opportunities WHERE code = $1', [code]);
    return rows[0]!.id;
  }

  async function move(code: string, body: Record<string, unknown>, headers: Record<string, string> = {}) {
    return app.inject({
      method: 'POST',
      url: `/opportunities/${await idOf(code)}/stage-transitions`,
      payload: body,
      headers,
    });
  }

  async function historyCount(code: string): Promise<number> {
    const { rows } = await db.query('SELECT count(*)::int AS n FROM stage_history WHERE opportunity_id = $1', [await idOf(code)]);
    return rows[0].n;
  }

  async function openTaskOf(code: string) {
    const { rows } = await db.query(
      `SELECT due_date, reason FROM follow_up_tasks WHERE opportunity_id = $1 AND status = 'OPEN'`,
      [await idOf(code)],
    );
    return rows[0] ?? null;
  }

  describe('listagem', () => {
    it('lista as 7 oportunidades com as mais urgentes primeiro', async () => {
      const response = await app.inject('/opportunities');
      expect(response.statusCode).toBe(200);
      const list = response.json();
      expect(list).toHaveLength(7);
      expect(list[0].attention.level).toBe('CRITICAL');
      const horizonte = list.find((o: { code: string }) => o.code === 'OPP-2002');
      expect(horizonte.attention.flags.map((f: { code: string }) => f.code)).toContain('PROPOSAL_EXPIRED');
    });

    it('pesquisa por empresa, código ou item de brinde', async () => {
      const bySearch = (term: string) =>
        app.inject(`/opportunities?search=${encodeURIComponent(term)}`).then((r) => r.json().map((o: { code: string }) => o.code));
      expect(await bySearch('squeeze')).toEqual(['OPP-2003']);
      expect(await bySearch('banco')).toEqual(['OPP-2005']);
      expect(await bySearch('opp-2004')).toEqual(['OPP-2004']);
      expect(await bySearch('100%')).toEqual([]); // curinga escapado, não casa com tudo
    });

    it('filtra só o que exige atenção', async () => {
      const list = (await app.inject('/opportunities?needsAttention=true')).json();
      expect(list.map((o: { code: string }) => o.code).sort()).toEqual(['OPP-2002', 'OPP-2003', 'OPP-2004']);
    });

    it('valida parâmetros de consulta', async () => {
      const response = await app.inject('/opportunities?stage=INEXISTENTE');
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('mudança de etapa', () => {
    it('avança e registra no histórico de onde, para onde e quem', async () => {
      const response = await move(
        'OPP-2001',
        { toStage: 'APRESENTACAO_ORCAMENTO', expectedFromStage: 'PRIMEIRO_CONTATO' },
        { 'x-user-name': encodeURIComponent('Ana Lúcia') },
      );
      expect(response.statusCode).toBe(200);
      expect(response.json().stage).toBe('APRESENTACAO_ORCAMENTO');

      const detail = (await app.inject(`/opportunities/${await idOf('OPP-2001')}`)).json();
      expect(detail.history[0]).toMatchObject({
        fromStage: 'PRIMEIRO_CONTATO',
        toStage: 'APRESENTACAO_ORCAMENTO',
        kind: 'ADVANCE',
        changedBy: 'Ana Lúcia',
      });
    });

    it('recusa transição inválida no backend sem alterar nada', async () => {
      const response = await move('OPP-2001', { toStage: 'FOLLOW_UP' });
      expect(response.statusCode).toBe(422);
      expect(response.json().error.code).toBe('STAGE_SKIP_NOT_ALLOWED');

      const { rows } = await db.query(`SELECT stage FROM opportunities WHERE code = 'OPP-2001'`);
      expect(rows[0].stage).toBe('PRIMEIRO_CONTATO');
      expect(await historyCount('OPP-2001')).toBe(1);
    });

    it('exige valor e item para Apresentação de Orçamento', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/opportunities',
        payload: { companyName: 'Loja Nova', sellerId: 1 },
      });
      expect(created.statusCode).toBe(201);
      expect(created.json().code).toBe('OPP-2008');

      const response = await app.inject({
        method: 'POST',
        url: `/opportunities/${created.json().id}/stage-transitions`,
        payload: { toStage: 'APRESENTACAO_ORCAMENTO' },
      });
      expect(response.statusCode).toBe(422);
      expect(response.json().error.details.missing.map((m: { code: string }) => m.code)).toEqual([
        'ESTIMATED_VALUE',
        'GIFT_ITEM',
      ]);
    });

    it('Perdida exige motivo, guarda o motivo e cancela o retorno pendente', async () => {
      expect((await move('OPP-2004', { toStage: 'PERDIDA' })).statusCode).toBe(422);

      const response = await move('OPP-2004', { toStage: 'PERDIDA', reason: 'Fechou com concorrente' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ stage: 'PERDIDA', lossReason: 'Fechou com concorrente' });
      expect(await openTaskOf('OPP-2004')).toBeNull();
    });

    it('estados finais não saem do lugar', async () => {
      const response = await move('OPP-2006', { toStage: 'FORECAST', reason: 'reabrir' });
      expect(response.statusCode).toBe(422);
      expect(response.json().error.code).toBe('FROM_FINAL_STAGE');
    });

    it('retorno permitido com motivo fica registrado como RETURN', async () => {
      const response = await move('OPP-2003', { toStage: 'APRESENTACAO_ORCAMENTO', reason: 'Cliente pediu revisão de quantidade' });
      expect(response.statusCode).toBe(200);
      const detail = (await app.inject(`/opportunities/${await idOf('OPP-2003')}`)).json();
      expect(detail.history[0]).toMatchObject({ kind: 'RETURN', reason: 'Cliente pediu revisão de quantidade' });
    });

    it('recusa quando a tela está desatualizada (outra pessoa já moveu)', async () => {
      const response = await move('OPP-2005', { toStage: 'FECHAMENTO', expectedFromStage: 'FOLLOW_UP' });
      expect(response.statusCode).toBe(409);
      expect(response.json().error).toMatchObject({ code: 'STALE_STAGE', details: { currentStage: 'FORECAST' } });
    });

    it('duas mudanças simultâneas na mesma oportunidade: só uma vence', async () => {
      const [a, b] = await Promise.all([
        move('OPP-2003', { toStage: 'FORECAST', expectedFromStage: 'FOLLOW_UP' }),
        move('OPP-2003', { toStage: 'PERDIDA', expectedFromStage: 'FOLLOW_UP', reason: 'Desistiu do evento' }),
      ]);
      expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
      expect(await historyCount('OPP-2003')).toBe(2);
    });
  });

  describe('edição', () => {
    it('não deixa apagar o valor de uma oportunidade em Follow-up', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/opportunities/${await idOf('OPP-2003')}`,
        payload: { estimatedValue: null },
      });
      expect(response.statusCode).toBe(422);
      expect(response.json().error.code).toBe('REQUIREMENTS_NOT_MET');
    });

    it('renovar a validade replaneja o retorno', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/opportunities/${await idOf('OPP-2004')}`,
        payload: { proposalValidUntil: '2026-10-30' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().attention.flags.map((f: { code: string }) => f.code)).not.toContain('PROPOSAL_EXPIRED');
    });

    it('oportunidade fechada não é editável', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/opportunities/${await idOf('OPP-2006')}`,
        payload: { notes: 'teste' },
      });
      expect(response.statusCode).toBe(409);
    });
  });

  describe('defesa em profundidade no banco', () => {
    it('constraint impede Perdida sem motivo mesmo fora da API', async () => {
      await expect(db.query(`UPDATE opportunities SET stage = 'PERDIDA' WHERE code = 'OPP-2001'`)).rejects.toThrow(
        /loss_reason_required/,
      );
    });

    it('só existe um retorno aberto por oportunidade', async () => {
      const id = await idOf('OPP-2001');
      await expect(
        db.query(`INSERT INTO follow_up_tasks (opportunity_id, due_date, reason, title) VALUES ($1, '2026-10-20', 'X', 'X')`, [id]),
      ).rejects.toThrow(/follow_up_tasks_one_open_per_opportunity/);
    });
  });

  describe('automação de follow-up', () => {
    it('a carga inicial gera um próximo retorno para cada oportunidade aberta', async () => {
      const { rows } = await db.query(
        `SELECT o.code FROM follow_up_tasks t JOIN opportunities o ON o.id = t.opportunity_id
          WHERE t.status = 'OPEN' ORDER BY o.code`,
      );
      expect(rows.map((r) => r.code)).toEqual(['OPP-2001', 'OPP-2002', 'OPP-2003', 'OPP-2004', 'OPP-2005']);
    });

    it('registrar contato conclui o retorno e agenda o próximo na data combinada', async () => {
      const id = await idOf('OPP-2002');
      const response = await app.inject({
        method: 'POST',
        url: `/opportunities/${id}/contacts`,
        payload: { channel: 'PHONE', summary: 'Cliente vai revisar a proposta com a diretoria', nextFollowUpAt: '2026-10-17' },
      });
      expect(response.statusCode).toBe(201);
      expect(response.json().lastContactAt).toBe(TODAY);
      expect(response.json().attention.flags.map((f: { code: string }) => f.code)).not.toContain('FOLLOW_UP_OVERDUE');

      expect(await openTaskOf('OPP-2002')).toMatchObject({ due_date: '2026-10-17', reason: 'CLIENT_REQUESTED' });
      const { rows } = await db.query(
        `SELECT count(*)::int AS n FROM follow_up_tasks WHERE opportunity_id = $1 AND status = 'DONE' AND closed_by_contact_id IS NOT NULL`,
        [id],
      );
      expect(rows[0].n).toBe(1);
    });

    it('agenda separa atrasados, hoje e próximos dias por vendedor', async () => {
      const agenda = (await app.inject('/follow-ups/agenda')).json();
      const bucketOf = (code: string) => agenda.find((t: { opportunity: { code: string } }) => t.opportunity.code === code)?.bucket;
      expect(bucketOf('OPP-2002')).toBe('OVERDUE');
      expect(bucketOf('OPP-2001')).toBe('TODAY');
      expect(bucketOf('OPP-2003')).toBe('UPCOMING');

      const anaOnly = (await app.inject('/follow-ups/agenda?sellerId=1')).json();
      expect(new Set(anaOnly.map((t: { opportunity: { seller: { name: string } } }) => t.opportunity.seller.name))).toEqual(
        new Set(['Ana']),
      );
    });

    it('envia o resumo do dia uma única vez por vendedor, mesmo rodando o job várias vezes', async () => {
      const first = await runFollowUpJob(db, notifier, TODAY);
      expect(first.digestsSent.sort()).toEqual(['Ana', 'Bruno', 'Carla']);
      expect(notifier.sent.find((d) => d.sellerName === 'Carla')?.overdue[0]?.code).toBe('OPP-2004');

      const second = await runFollowUpJob(db, notifier, TODAY);
      expect(second.digestsSent).toEqual([]);
      expect(second.tasks).toMatchObject({ created: 0, updated: 0, canceled: 0 });
      expect(notifier.sent).toHaveLength(3);
    });

    it('se o envio falhar, o resumo não é marcado como enviado e o próximo ciclo tenta de novo', async () => {
      const failing: Notifier = { channel: 'fake', send: async () => Promise.reject(new Error('webhook fora do ar')) };
      const failed = await runFollowUpJob(db, failing, TODAY);
      expect(failed.digestsSent).toEqual([]);
      expect(failed.digestErrors).toHaveLength(3);

      const retry = await runFollowUpJob(db, notifier, TODAY);
      expect(retry.digestsSent).toHaveLength(3);
    });
  });

  describe('segurança', () => {
    it('com API_KEY definida, recusa requisições sem a chave', async () => {
      const secured = await buildApp({ db, today: () => TODAY, notifier, apiKey: 'segredo-de-teste' });
      try {
        expect((await secured.inject('/opportunities')).statusCode).toBe(401);
        expect((await secured.inject({ url: '/opportunities', headers: { 'x-api-key': 'errada' } })).statusCode).toBe(401);
        expect((await secured.inject({ url: '/opportunities', headers: { 'x-api-key': 'segredo-de-teste' } })).statusCode).toBe(200);
        expect((await secured.inject('/health')).statusCode).toBe(200);
      } finally {
        await secured.close();
      }
    });

    it('vendedor inexistente vira erro de negócio claro, não erro de banco', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/opportunities',
        payload: { companyName: 'X', sellerId: 999 },
      });
      expect(response.statusCode).toBe(422);
      expect(response.json().error.code).toBe('SELLER_NOT_FOUND');
    });
  });
});
