import { describe, expect, it } from 'vitest';
import { buildSellerDigests, formatDigestText } from '../../src/automation/digest.js';
import type { AgendaEntry } from '../../src/services/follow-ups.js';

const TODAY = '2026-10-15';

function entry(overrides: { id: number; seller: string; bucket: AgendaEntry['bucket']; daysLate?: number }): AgendaEntry {
  const sellerId = overrides.seller.length; // id estável qualquer por nome
  return {
    id: overrides.id,
    dueDate: TODAY,
    reason: 'CADENCE',
    title: 'Cobrar retorno sobre a proposta',
    bucket: overrides.bucket,
    daysLate: overrides.daysLate ?? 0,
    opportunity: {
      id: overrides.id,
      code: `OPP-${overrides.id}`,
      companyName: `Empresa ${overrides.id}`,
      stage: 'FOLLOW_UP',
      estimatedValue: 1000,
      seller: { id: sellerId, name: overrides.seller },
    },
  };
}

describe('buildSellerDigests', () => {
  it('agrupa por vendedor, ignora os próximos dias e ordena atrasados do mais antigo', () => {
    const digests = buildSellerDigests(
      [
        entry({ id: 1, seller: 'Bruno', bucket: 'OVERDUE', daysLate: 2 }),
        entry({ id: 2, seller: 'Bruno', bucket: 'OVERDUE', daysLate: 9 }),
        entry({ id: 3, seller: 'Bruno', bucket: 'TODAY' }),
        entry({ id: 4, seller: 'Ana', bucket: 'TODAY' }),
        entry({ id: 5, seller: 'Carla', bucket: 'UPCOMING' }),
      ],
      TODAY,
    );

    expect(digests.map((d) => d.sellerName)).toEqual(['Ana', 'Bruno']); // Carla só tem retorno futuro
    const bruno = digests[1]!;
    expect(bruno.overdue.map((l) => l.code)).toEqual(['OPP-2', 'OPP-1']);
    expect(bruno.dueToday.map((l) => l.code)).toEqual(['OPP-3']);
  });

  it('gera um texto curto, pronto para Slack/WhatsApp', () => {
    const [digest] = buildSellerDigests([entry({ id: 7, seller: 'Ana', bucket: 'OVERDUE', daysLate: 1 })], TODAY);
    const text = formatDigestText(digest!);
    expect(text).toContain('Bom dia, Ana! Seus retornos de 15/10/2026');
    expect(text).toContain('ATRASADOS (1)');
    expect(text).toContain('OPP-7 Empresa 7: Cobrar retorno sobre a proposta (atrasado há 1 dia)');
    expect(text).not.toContain('PARA HOJE');
  });
});
