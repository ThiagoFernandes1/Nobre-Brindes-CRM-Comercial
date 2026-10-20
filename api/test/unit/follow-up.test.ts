import { describe, expect, it } from 'vitest';
import { planFollowUp, reconcileTask, type FollowUpSubject } from '../../src/domain/follow-up.js';

function subject(overrides: Partial<FollowUpSubject> = {}): FollowUpSubject {
  return {
    stage: 'FOLLOW_UP',
    leadReceivedOn: '2026-10-01',
    lastContactAt: '2026-10-13',
    requestedFollowUpAt: null,
    proposalValidUntil: null,
    eventDate: null,
    ...overrides,
  };
}

describe('planFollowUp', () => {
  it('não planeja retorno para estados finais', () => {
    expect(planFollowUp(subject({ stage: 'FECHAMENTO' }))).toBeNull();
    expect(planFollowUp(subject({ stage: 'PERDIDA' }))).toBeNull();
  });

  it('lead sem nenhum contato: retorno no mesmo dia em que entrou (SLA de primeiro contato)', () => {
    expect(planFollowUp(subject({ stage: 'PRIMEIRO_CONTATO', lastContactAt: null }))).toMatchObject({
      dueDate: '2026-10-01',
      reason: 'FIRST_CONTACT_SLA',
    });
  });

  it.each([
    ['PRIMEIRO_CONTATO', '2026-10-14'],
    ['APRESENTACAO_ORCAMENTO', '2026-10-15'],
    ['FOLLOW_UP', '2026-10-16'],
    ['FORECAST', '2026-10-15'],
  ] as const)('cadência de %s a partir do último contato -> %s', (stage, dueDate) => {
    expect(planFollowUp(subject({ stage }))).toMatchObject({ dueDate, reason: 'CADENCE' });
  });

  it('data combinada com o cliente substitui a cadência', () => {
    expect(planFollowUp(subject({ requestedFollowUpAt: '2026-10-25' }))).toMatchObject({
      dueDate: '2026-10-25',
      reason: 'CLIENT_REQUESTED',
    });
  });

  it('antecipa para a véspera do vencimento da proposta', () => {
    expect(planFollowUp(subject({ requestedFollowUpAt: '2026-10-25', proposalValidUntil: '2026-10-20' }))).toMatchObject({
      dueDate: '2026-10-19',
      reason: 'PROPOSAL_EXPIRING',
    });
  });

  it('antecipa para o último dia de produção antes do evento', () => {
    expect(planFollowUp(subject({ requestedFollowUpAt: '2026-11-10', eventDate: '2026-11-05' }))).toMatchObject({
      dueDate: '2026-10-29',
      reason: 'EVENT_DEADLINE',
    });
  });

  it('ignora prazos que ficaram para trás do último contato (o vendedor já tratou)', () => {
    // véspera do vencimento = 12/10 e prazo de produção = 11/10, mas o último contato foi 13/10
    expect(planFollowUp(subject({ proposalValidUntil: '2026-10-13', eventDate: '2026-10-18' }))).toMatchObject({
      dueDate: '2026-10-16',
      reason: 'CADENCE',
    });
  });

  it('validade da proposta não conta em Primeiro Contato (ainda não há proposta)', () => {
    expect(planFollowUp(subject({ stage: 'PRIMEIRO_CONTATO', proposalValidUntil: '2026-10-14' }))).toMatchObject({
      reason: 'CADENCE',
    });
  });
});

describe('reconcileTask', () => {
  const plan = { dueDate: '2026-10-16', reason: 'CADENCE' as const, title: 'Cobrar retorno sobre a proposta' };
  const task = { id: 7, ...plan };

  it('cria a tarefa quando há retorno planejado e nenhuma aberta', () => {
    expect(reconcileTask(plan, null)).toEqual({ type: 'CREATE', plan });
  });

  it('mantém quando nada mudou (idempotente)', () => {
    expect(reconcileTask(plan, task)).toEqual({ type: 'KEEP' });
  });

  it('atualiza quando o prazo ou o motivo mudam', () => {
    const earlier = { ...plan, dueDate: '2026-10-14', reason: 'PROPOSAL_EXPIRING' as const };
    expect(reconcileTask(earlier, task)).toEqual({ type: 'UPDATE', taskId: 7, plan: earlier });
  });

  it('cancela a tarefa aberta quando a oportunidade chega a um estado final', () => {
    expect(reconcileTask(null, task)).toEqual({ type: 'CANCEL', taskId: 7 });
    expect(reconcileTask(null, null)).toEqual({ type: 'KEEP' });
  });
});
