export const STAGES = [
  'PRIMEIRO_CONTATO',
  'APRESENTACAO_ORCAMENTO',
  'FOLLOW_UP',
  'FORECAST',
  'FECHAMENTO',
  'PERDIDA',
] as const;

export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  PRIMEIRO_CONTATO: 'Primeiro Contato',
  APRESENTACAO_ORCAMENTO: 'Apresentação de Orçamento',
  FOLLOW_UP: 'Follow-up',
  FORECAST: 'Forecast',
  FECHAMENTO: 'Fechamento',
  PERDIDA: 'Perdida',
};

/** Etapas do funil, na ordem. "Perdida" fica fora: é uma saída lateral, não um degrau. */
export const PIPELINE = [
  'PRIMEIRO_CONTATO',
  'APRESENTACAO_ORCAMENTO',
  'FOLLOW_UP',
  'FORECAST',
  'FECHAMENTO',
] as const satisfies readonly Stage[];

export const FINAL_STAGES: readonly Stage[] = ['FECHAMENTO', 'PERDIDA'];

export type OpenStage = Exclude<Stage, 'FECHAMENTO' | 'PERDIDA'>;

export function isFinal(stage: Stage): stage is 'FECHAMENTO' | 'PERDIDA' {
  return FINAL_STAGES.includes(stage);
}

export function pipelineIndex(stage: Stage): number {
  return (PIPELINE as readonly Stage[]).indexOf(stage);
}

/**
 * Retornos de etapa permitidos (origem -> destinos). Decisão documentada no README:
 * - Follow-up -> Apresentação de Orçamento: cliente pediu revisão (quantidade, item, preço).
 * - Forecast -> Follow-up: cliente esfriou/adiou a decisão; volta a ser cobrado.
 * - Forecast -> Apresentação de Orçamento: renegociação que exige nova proposta.
 * Nunca se volta para Primeiro Contato (o contato já aconteceu; voltar distorceria o SLA)
 * e estados finais não reabrem (uma nova negociação vira uma nova oportunidade).
 */
export const ALLOWED_RETURNS: Partial<Record<Stage, readonly Stage[]>> = {
  FOLLOW_UP: ['APRESENTACAO_ORCAMENTO'],
  FORECAST: ['FOLLOW_UP', 'APRESENTACAO_ORCAMENTO'],
};
