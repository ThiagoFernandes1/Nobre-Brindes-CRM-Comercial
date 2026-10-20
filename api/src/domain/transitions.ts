import { formatBr, type IsoDate } from '../lib/dates.js';
import {
  ALLOWED_RETURNS,
  isFinal,
  PIPELINE,
  pipelineIndex,
  STAGE_LABELS,
  type Stage,
} from './stages.js';

export interface StageSubject {
  stage: Stage;
  estimatedValue: number | null;
  itemCount: number;
  proposalValidUntil: IsoDate | null;
}

export type TransitionKind = 'ADVANCE' | 'RETURN' | 'LOSS';

export type TransitionErrorCode =
  | 'SAME_STAGE'
  | 'FROM_FINAL_STAGE'
  | 'LOSS_REASON_REQUIRED'
  | 'RETURN_NOT_ALLOWED'
  | 'RETURN_REASON_REQUIRED'
  | 'CLOSING_REQUIRES_FORECAST'
  | 'STAGE_SKIP_NOT_ALLOWED'
  | 'REQUIREMENTS_NOT_MET';

export type RequirementCode = 'ESTIMATED_VALUE' | 'GIFT_ITEM' | 'PROPOSAL_VALIDITY' | 'PROPOSAL_NOT_EXPIRED';

export interface MissingRequirement {
  code: RequirementCode;
  message: string;
}

export type TransitionCheck =
  | { ok: true; kind: TransitionKind }
  | { ok: false; code: TransitionErrorCode; message: string; missing?: MissingRequirement[] };

const MIN_REASON_LENGTH = 3;

function hasReason(reason: string | null | undefined): boolean {
  return (reason ?? '').trim().length >= MIN_REASON_LENGTH;
}

function fail(code: TransitionErrorCode, message: string, missing?: MissingRequirement[]): TransitionCheck {
  return missing ? { ok: false, code, message, missing } : { ok: false, code, message };
}

// Requisitos cumulativos para estar numa etapa. Vale na mudança de etapa e na edição.
export function stageInvariantViolations(subject: Omit<StageSubject, 'stage'>, stage: Stage): MissingRequirement[] {
  const index = pipelineIndex(stage);
  const missing: MissingRequirement[] = [];

  if (index >= pipelineIndex('APRESENTACAO_ORCAMENTO')) {
    if (subject.estimatedValue === null || subject.estimatedValue <= 0) {
      missing.push({ code: 'ESTIMATED_VALUE', message: 'Informe o valor estimado da oportunidade.' });
    }
    if (subject.itemCount < 1) {
      missing.push({ code: 'GIFT_ITEM', message: 'Informe pelo menos um item de brinde.' });
    }
  }
  // Follow-up = proposta enviada, então precisa de validade
  if (index >= pipelineIndex('FOLLOW_UP')) {
    if (!subject.proposalValidUntil) {
      missing.push({ code: 'PROPOSAL_VALIDITY', message: 'Informe a validade da proposta enviada.' });
    }
  }
  return missing;
}

export function checkTransition(
  subject: StageSubject,
  to: Stage,
  options: { reason?: string | null; today: IsoDate },
): TransitionCheck {
  const from = subject.stage;

  if (from === to) {
    return fail('SAME_STAGE', `A oportunidade já está em ${STAGE_LABELS[to]}.`);
  }
  if (isFinal(from)) {
    return fail(
      'FROM_FINAL_STAGE',
      `${STAGE_LABELS[from]} é um estado final. Para uma nova negociação com o cliente, crie uma nova oportunidade.`,
    );
  }

  if (to === 'PERDIDA') {
    if (!hasReason(options.reason)) {
      return fail('LOSS_REASON_REQUIRED', 'Informe o motivo da perda.');
    }
    return { ok: true, kind: 'LOSS' };
  }

  const fromIndex = pipelineIndex(from);
  const toIndex = pipelineIndex(to);
  const isReturn = toIndex < fromIndex;

  if (isReturn) {
    if (!ALLOWED_RETURNS[from]?.includes(to)) {
      return fail(
        'RETURN_NOT_ALLOWED',
        `Não é permitido voltar de ${STAGE_LABELS[from]} para ${STAGE_LABELS[to]}.`,
      );
    }
    if (!hasReason(options.reason)) {
      return fail('RETURN_REASON_REQUIRED', 'Informe o motivo do retorno de etapa (ex.: cliente pediu revisão).');
    }
  } else {
    if (to === 'FECHAMENTO' && from !== 'FORECAST') {
      return fail('CLOSING_REQUIRES_FORECAST', 'Uma oportunidade só entra em Fechamento a partir de Forecast.');
    }
    if (toIndex !== fromIndex + 1) {
      return fail(
        'STAGE_SKIP_NOT_ALLOWED',
        `Avance uma etapa por vez: de ${STAGE_LABELS[from]} o próximo passo é ${STAGE_LABELS[PIPELINE[fromIndex + 1]!]}.`,
      );
    }
  }

  const missing = stageInvariantViolations(subject, to);
  if (to === 'FECHAMENTO' && subject.proposalValidUntil && subject.proposalValidUntil < options.today) {
    missing.push({
      code: 'PROPOSAL_NOT_EXPIRED',
      message: `A proposta venceu em ${formatBr(subject.proposalValidUntil)}. Renove a validade com o cliente antes de fechar.`,
    });
  }
  if (missing.length > 0) {
    return fail(
      'REQUIREMENTS_NOT_MET',
      `Para mover para ${STAGE_LABELS[to]}: ${missing.map((m) => m.message).join(' ')}`,
      missing,
    );
  }

  return { ok: true, kind: isReturn ? 'RETURN' : 'ADVANCE' };
}
