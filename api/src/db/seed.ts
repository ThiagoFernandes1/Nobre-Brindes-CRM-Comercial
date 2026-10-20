import { pathToFileURL } from 'node:url';
import type { Stage } from '../domain/stages.js';
import type { IsoDate } from '../lib/dates.js';
import { reconcileAllFollowUps } from '../services/follow-ups.js';
import { createPool, withTransaction, type Db } from './pool.js';

interface SeedOpportunity {
  code: string;
  company: string;
  item: string;
  quantity: number;
  value: number;
  seller: string;
  lastContact: IsoDate;
  proposalValidUntil: IsoDate | null;
  eventDate: IsoDate;
  stage: Stage;
  lossReason?: string;
}

// dados do case (referência 15/10/2026)
const OPPORTUNITIES: SeedOpportunity[] = [
  { code: 'OPP-2001', company: 'Tech Alpha Ltda', item: 'Caneca personalizada', quantity: 300, value: 4500, seller: 'Ana', lastContact: '2026-10-14', proposalValidUntil: null, eventDate: '2026-11-30', stage: 'PRIMEIRO_CONTATO' },
  { code: 'OPP-2002', company: 'Construtora Horizonte', item: 'Kit escritório', quantity: 120, value: 9800, seller: 'Bruno', lastContact: '2026-10-06', proposalValidUntil: '2026-10-13', eventDate: '2026-10-25', stage: 'APRESENTACAO_ORCAMENTO' },
  { code: 'OPP-2003', company: 'Clínica Vida', item: 'Squeeze personalizado', quantity: 500, value: 7200, seller: 'Ana', lastContact: '2026-10-13', proposalValidUntil: '2026-10-20', eventDate: '2026-10-18', stage: 'FOLLOW_UP' },
  { code: 'OPP-2004', company: 'Agência Pulso', item: 'Camiseta estampada', quantity: 80, value: 3900, seller: 'Carla', lastContact: '2026-10-02', proposalValidUntil: '2026-10-10', eventDate: '2026-11-05', stage: 'FOLLOW_UP' },
  { code: 'OPP-2005', company: 'Banco Norte', item: 'Agenda executiva', quantity: 1000, value: 38000, seller: 'Bruno', lastContact: '2026-10-15', proposalValidUntil: '2026-10-22', eventDate: '2026-12-12', stage: 'FORECAST' },
  { code: 'OPP-2006', company: 'Escola Saber', item: 'Mochila infantil', quantity: 250, value: 11500, seller: 'Carla', lastContact: '2026-10-09', proposalValidUntil: '2026-10-16', eventDate: '2026-10-17', stage: 'FECHAMENTO' },
  // a planilha não tem o motivo da perda, que é obrigatório
  { code: 'OPP-2007', company: 'Padaria do Bairro', item: 'Caneta promocional', quantity: 50, value: 350, seller: 'Ana', lastContact: '2026-10-01', proposalValidUntil: '2026-10-08', eventDate: '2026-10-20', stage: 'PERDIDA', lossReason: 'Motivo não registrado na planilha de origem (carga inicial)' },
];

export async function seedDatabase(db: Db): Promise<void> {
  await withTransaction(db, async (client) => {
    await client.query(`TRUNCATE follow_up_digests, follow_up_tasks, contacts, stage_history, opportunity_items,
                        opportunities, sellers RESTART IDENTITY CASCADE`);

    const sellerIds = new Map<string, number>();
    for (const name of [...new Set(OPPORTUNITIES.map((o) => o.seller))]) {
      const { rows } = await client.query<{ id: number }>('INSERT INTO sellers (name) VALUES ($1) RETURNING id', [name]);
      sellerIds.set(name, rows[0]!.id);
    }

    for (const o of OPPORTUNITIES) {
      // a planilha não tem data de entrada do lead, então uso o último contato
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO opportunities (code, company_name, seller_id, estimated_value, stage, lead_received_on,
                                    last_contact_at, proposal_valid_until, event_date, loss_reason)
         VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8, $9) RETURNING id`,
        [o.code, o.company, sellerIds.get(o.seller), o.value, o.stage, o.lastContact, o.proposalValidUntil, o.eventDate, o.lossReason ?? null],
      );
      const id = rows[0]!.id;
      await client.query(
        'INSERT INTO opportunity_items (opportunity_id, description, quantity) VALUES ($1, $2, $3)',
        [id, o.item, o.quantity],
      );
      await client.query(
        `INSERT INTO stage_history (opportunity_id, from_stage, to_stage, kind, reason, changed_by)
         VALUES ($1, NULL, $2, 'CREATED', 'Carga inicial: etapa importada da planilha do case', 'carga-inicial')`,
        [id, o.stage],
      );
    }

    // próximos códigos seguem a numeração (OPP-2008...)
    await client.query(
      `SELECT setval('opportunity_code_seq', (SELECT max(substring(code FROM 5)::int) FROM opportunities))`,
    );
  });

  await reconcileAllFollowUps(db);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { config } = await import('../config.js');
  const db = createPool(config.DATABASE_URL);
  try {
    await seedDatabase(db);
    console.log(`Carga inicial concluída: ${OPPORTUNITIES.length} oportunidades.`);
  } finally {
    await db.end();
  }
}
