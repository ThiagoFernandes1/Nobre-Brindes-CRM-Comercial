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

// Perdida fica fora da sequência
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

// retornos permitidos (justificativa no README)
export const ALLOWED_RETURNS: Partial<Record<Stage, readonly Stage[]>> = {
  FOLLOW_UP: ['APRESENTACAO_ORCAMENTO'],
  FORECAST: ['FOLLOW_UP', 'APRESENTACAO_ORCAMENTO'],
};
