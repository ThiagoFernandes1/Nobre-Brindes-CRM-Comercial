import type { Stage } from './types';

// cor de cada etapa (bolinha na coluna, na lista e no detalhe)
export const STAGE_DOT: Record<Stage, string> = {
  PRIMEIRO_CONTATO: 'bg-sky-500',
  APRESENTACAO_ORCAMENTO: 'bg-indigo-500',
  FOLLOW_UP: 'bg-cyan-600',
  FORECAST: 'bg-emerald-500',
  FECHAMENTO: 'bg-brand-700',
  PERDIDA: 'bg-stone-400',
};
