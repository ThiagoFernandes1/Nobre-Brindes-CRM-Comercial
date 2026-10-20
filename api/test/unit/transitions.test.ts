import { describe, expect, it } from 'vitest';
import { checkTransition, stageInvariantViolations, type StageSubject } from '../../src/domain/transitions.js';
import type { Stage } from '../../src/domain/stages.js';

const TODAY = '2026-10-15';

function subject(overrides: Partial<StageSubject> = {}): StageSubject {
  return {
    stage: 'PRIMEIRO_CONTATO',
    estimatedValue: 4500,
    itemCount: 1,
    proposalValidUntil: '2026-11-30',
    ...overrides,
  };
}

function move(from: Stage, to: Stage, overrides: Partial<StageSubject> = {}, reason?: string) {
  return checkTransition(subject({ stage: from, ...overrides }), to, { reason, today: TODAY });
}

describe('avanço no funil', () => {
  it.each([
    ['PRIMEIRO_CONTATO', 'APRESENTACAO_ORCAMENTO'],
    ['APRESENTACAO_ORCAMENTO', 'FOLLOW_UP'],
    ['FOLLOW_UP', 'FORECAST'],
    ['FORECAST', 'FECHAMENTO'],
  ] as const)('permite %s -> %s quando os requisitos estão cumpridos', (from, to) => {
    expect(move(from, to)).toEqual({ ok: true, kind: 'ADVANCE' });
  });

  it('não permite pular etapas e indica o próximo passo', () => {
    const result = move('PRIMEIRO_CONTATO', 'FOLLOW_UP');
    expect(result).toMatchObject({ ok: false, code: 'STAGE_SKIP_NOT_ALLOWED' });
    expect(!result.ok && result.message).toContain('Apresentação de Orçamento');
  });

  it('rejeita mover para a mesma etapa', () => {
    expect(move('FOLLOW_UP', 'FOLLOW_UP')).toMatchObject({ ok: false, code: 'SAME_STAGE' });
  });
});

describe('regra: Apresentação de Orçamento exige valor estimado e item de brinde', () => {
  it('bloqueia sem valor estimado', () => {
    expect(move('PRIMEIRO_CONTATO', 'APRESENTACAO_ORCAMENTO', { estimatedValue: null })).toMatchObject({
      ok: false,
      code: 'REQUIREMENTS_NOT_MET',
      missing: [{ code: 'ESTIMATED_VALUE' }],
    });
  });

  it('trata valor zero como não informado', () => {
    expect(move('PRIMEIRO_CONTATO', 'APRESENTACAO_ORCAMENTO', { estimatedValue: 0 })).toMatchObject({
      missing: [{ code: 'ESTIMATED_VALUE' }],
    });
  });

  it('bloqueia sem item de brinde', () => {
    expect(move('PRIMEIRO_CONTATO', 'APRESENTACAO_ORCAMENTO', { itemCount: 0 })).toMatchObject({
      ok: false,
      missing: [{ code: 'GIFT_ITEM' }],
    });
  });

  it('lista todos os requisitos faltantes de uma vez', () => {
    const result = move('PRIMEIRO_CONTATO', 'APRESENTACAO_ORCAMENTO', { estimatedValue: null, itemCount: 0 });
    expect(!result.ok && result.missing?.map((m) => m.code)).toEqual(['ESTIMATED_VALUE', 'GIFT_ITEM']);
  });

  it('vale também ao voltar para Apresentação de Orçamento', () => {
    expect(move('FOLLOW_UP', 'APRESENTACAO_ORCAMENTO', { itemCount: 0 }, 'cliente pediu revisão')).toMatchObject({
      ok: false,
      code: 'REQUIREMENTS_NOT_MET',
    });
  });
});

describe('regra: Follow-up exige proposta com validade', () => {
  it('bloqueia a entrada em Follow-up sem validade da proposta', () => {
    expect(move('APRESENTACAO_ORCAMENTO', 'FOLLOW_UP', { proposalValidUntil: null })).toMatchObject({
      ok: false,
      missing: [{ code: 'PROPOSAL_VALIDITY' }],
    });
  });
});

describe('regra: Fechamento só a partir de Forecast', () => {
  it.each(['PRIMEIRO_CONTATO', 'APRESENTACAO_ORCAMENTO', 'FOLLOW_UP'] as const)('bloqueia %s -> Fechamento', (from) => {
    expect(move(from, 'FECHAMENTO')).toMatchObject({ ok: false, code: 'CLOSING_REQUIRES_FORECAST' });
  });

  it('não fecha com proposta vencida', () => {
    expect(move('FORECAST', 'FECHAMENTO', { proposalValidUntil: '2026-10-14' })).toMatchObject({
      ok: false,
      missing: [{ code: 'PROPOSAL_NOT_EXPIRED' }],
    });
  });

  it('fecha com proposta que vence hoje', () => {
    expect(move('FORECAST', 'FECHAMENTO', { proposalValidUntil: TODAY })).toEqual({ ok: true, kind: 'ADVANCE' });
  });
});

describe('regra: Perdida', () => {
  it.each(['PRIMEIRO_CONTATO', 'APRESENTACAO_ORCAMENTO', 'FOLLOW_UP', 'FORECAST'] as const)(
    'pode ser aplicada a partir de %s com motivo',
    (from) => {
      expect(move(from, 'PERDIDA', {}, 'Cliente fechou com concorrente')).toEqual({ ok: true, kind: 'LOSS' });
    },
  );

  it('não exige requisitos de etapa (dá para perder um lead sem valor nem item)', () => {
    expect(move('PRIMEIRO_CONTATO', 'PERDIDA', { estimatedValue: null, itemCount: 0 }, 'Sem verba')).toMatchObject({
      ok: true,
    });
  });

  it.each([undefined, '', '   ', 'ok'])('exige motivo (recebido: %j)', (reason) => {
    expect(move('FOLLOW_UP', 'PERDIDA', {}, reason)).toMatchObject({ ok: false, code: 'LOSS_REASON_REQUIRED' });
  });
});

describe('estados finais', () => {
  it.each([
    ['FECHAMENTO', 'FORECAST'],
    ['FECHAMENTO', 'PERDIDA'],
    ['PERDIDA', 'PRIMEIRO_CONTATO'],
    ['PERDIDA', 'FOLLOW_UP'],
  ] as const)('%s não pode ir para %s', (from, to) => {
    expect(move(from, to, {}, 'qualquer motivo')).toMatchObject({ ok: false, code: 'FROM_FINAL_STAGE' });
  });
});

describe('retornos de etapa', () => {
  it.each([
    ['FOLLOW_UP', 'APRESENTACAO_ORCAMENTO'],
    ['FORECAST', 'FOLLOW_UP'],
    ['FORECAST', 'APRESENTACAO_ORCAMENTO'],
  ] as const)('permite %s -> %s com motivo', (from, to) => {
    expect(move(from, to, {}, 'Cliente pediu revisão da quantidade')).toEqual({ ok: true, kind: 'RETURN' });
  });

  it('exige motivo no retorno', () => {
    expect(move('FOLLOW_UP', 'APRESENTACAO_ORCAMENTO')).toMatchObject({ ok: false, code: 'RETURN_REASON_REQUIRED' });
  });

  it.each([
    ['APRESENTACAO_ORCAMENTO', 'PRIMEIRO_CONTATO'],
    ['FOLLOW_UP', 'PRIMEIRO_CONTATO'],
    ['FORECAST', 'PRIMEIRO_CONTATO'],
  ] as const)('não permite voltar %s -> %s', (from, to) => {
    expect(move(from, to, {}, 'motivo qualquer')).toMatchObject({ ok: false, code: 'RETURN_NOT_ALLOWED' });
  });
});

describe('stageInvariantViolations', () => {
  const empty = { estimatedValue: null, itemCount: 0, proposalValidUntil: null };

  it('Primeiro Contato não exige nada', () => {
    expect(stageInvariantViolations(empty, 'PRIMEIRO_CONTATO')).toEqual([]);
  });

  it('requisitos são cumulativos: Forecast exige valor, item e validade', () => {
    expect(stageInvariantViolations(empty, 'FORECAST').map((m) => m.code)).toEqual([
      'ESTIMATED_VALUE',
      'GIFT_ITEM',
      'PROPOSAL_VALIDITY',
    ]);
  });
});
