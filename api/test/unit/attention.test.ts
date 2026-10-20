import { describe, expect, it } from 'vitest';
import { assessAttention } from '../../src/domain/attention.js';
import type { FollowUpSubject } from '../../src/domain/follow-up.js';

const TODAY = '2026-10-15';

function subject(overrides: Partial<FollowUpSubject> = {}): FollowUpSubject {
  return {
    stage: 'FOLLOW_UP',
    leadReceivedOn: '2026-10-01',
    lastContactAt: '2026-10-14',
    requestedFollowUpAt: null,
    proposalValidUntil: '2026-11-30',
    eventDate: '2026-12-20',
    ...overrides,
  };
}

const assess = (overrides: Partial<FollowUpSubject>) => assessAttention(subject(overrides), TODAY);
const codes = (overrides: Partial<FollowUpSubject>) => assess(overrides).flags.map((f) => f.code);

describe('assessAttention', () => {
  it('oportunidade em dia não pede atenção', () => {
    expect(assess({})).toMatchObject({ level: 'OK', flags: [], score: 0 });
  });

  it('estados finais nunca pedem atenção, mesmo com prazos vencidos', () => {
    expect(assess({ stage: 'FECHAMENTO', proposalValidUntil: '2026-10-01', eventDate: '2026-10-10' })).toMatchObject({
      level: 'OK',
      flags: [],
      nextFollowUp: null,
    });
  });

  it('retorno atrasado: alerta até 2 dias, crítico a partir de 3', () => {
    // Follow-up tem cadência de 3 dias
    expect(assess({ lastContactAt: '2026-10-11' }).flags[0]).toEqual({
      code: 'FOLLOW_UP_OVERDUE',
      severity: 'WARNING',
      message: 'Retorno atrasado há 1 dia',
    });
    expect(assess({ lastContactAt: '2026-10-09' }).flags[0]).toMatchObject({
      code: 'FOLLOW_UP_OVERDUE',
      severity: 'CRITICAL',
    });
  });

  it('retorno previsto para hoje ainda não é atraso', () => {
    const result = assess({ lastContactAt: '2026-10-12' });
    expect(result.level).toBe('OK');
    expect(result.nextFollowUp).toMatchObject({ dueDate: TODAY, daysLate: 0 });
  });

  it('lead sem primeiro contato vira crítico já no dia seguinte', () => {
    expect(
      assess({ stage: 'PRIMEIRO_CONTATO', lastContactAt: null, leadReceivedOn: '2026-10-14', proposalValidUntil: null }).flags[0],
    ).toMatchObject({ code: 'FIRST_CONTACT_OVERDUE', severity: 'CRITICAL' });
  });

  it('proposta vencida é crítica; vencendo em até 3 dias é alerta', () => {
    expect(codes({ proposalValidUntil: '2026-10-14' })).toContain('PROPOSAL_EXPIRED');
    expect(assess({ proposalValidUntil: TODAY }).flags[0]?.message).toBe('Proposta vence hoje');
    expect(codes({ proposalValidUntil: '2026-10-18' })).toContain('PROPOSAL_EXPIRING');
    expect(codes({ proposalValidUntil: '2026-10-19' })).not.toContain('PROPOSAL_EXPIRING');
  });

  it('proposta sem validade em Follow-up é um problema de dado; em Primeiro Contato é normal', () => {
    expect(codes({ proposalValidUntil: null })).toEqual(['PROPOSAL_WITHOUT_VALIDITY']);
    expect(codes({ stage: 'PRIMEIRO_CONTATO', proposalValidUntil: null })).toEqual([]);
  });

  it('evento: crítico dentro do prazo de produção, alerta em até 14 dias, crítico se já passou', () => {
    expect(assess({ eventDate: '2026-10-18' }).flags[0]).toMatchObject({ code: 'EVENT_SOON', severity: 'CRITICAL' });
    expect(assess({ eventDate: '2026-10-25' }).flags[0]).toMatchObject({ code: 'EVENT_SOON', severity: 'WARNING' });
    expect(codes({ eventDate: '2026-10-30' })).toEqual([]);
    expect(codes({ eventDate: '2026-10-10' })).toContain('EVENT_PASSED');
  });

  it('críticos vêm antes dos alertas e somam mais no score', () => {
    const result = assess({ proposalValidUntil: '2026-10-17', eventDate: '2026-10-16' });
    expect(result.level).toBe('CRITICAL');
    expect(result.flags.map((f) => f.severity)).toEqual(['CRITICAL', 'WARNING']);
    expect(result.score).toBeGreaterThan(assess({ proposalValidUntil: '2026-10-17' }).score);
  });
});

describe('cenário do case (data de referência 15/10/2026)', () => {
  it('OPP-2001 Tech Alpha: sem validade, mas está em Primeiro Contato -> em dia', () => {
    expect(
      assess({ stage: 'PRIMEIRO_CONTATO', lastContactAt: '2026-10-14', proposalValidUntil: null, eventDate: '2026-11-30' }).level,
    ).toBe('OK');
  });

  it('OPP-2002 Construtora Horizonte: sem contato há 9 dias, proposta vencida, evento em 10 dias', () => {
    const result = assess({
      stage: 'APRESENTACAO_ORCAMENTO',
      lastContactAt: '2026-10-06',
      proposalValidUntil: '2026-10-13',
      eventDate: '2026-10-25',
    });
    expect(result.level).toBe('CRITICAL');
    expect(result.flags.map((f) => f.code)).toEqual(['FOLLOW_UP_OVERDUE', 'PROPOSAL_EXPIRED', 'EVENT_SOON']);
  });

  it('OPP-2003 Clínica Vida: evento em 3 dias -> crítico', () => {
    const result = assess({ stage: 'FOLLOW_UP', lastContactAt: '2026-10-13', proposalValidUntil: '2026-10-20', eventDate: '2026-10-18' });
    expect(result.level).toBe('CRITICAL');
    expect(result.flags.map((f) => f.code)).toEqual(['EVENT_SOON']);
  });

  it('OPP-2005 Banco Norte: contato hoje, proposta e evento distantes -> em dia', () => {
    expect(
      assess({ stage: 'FORECAST', lastContactAt: '2026-10-15', proposalValidUntil: '2026-10-22', eventDate: '2026-12-12' }).level,
    ).toBe('OK');
  });
});
