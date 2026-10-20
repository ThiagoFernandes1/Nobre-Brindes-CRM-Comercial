import type { Meta, Stage } from './types';

export type MoveKind = 'ADVANCE' | 'RETURN' | 'LOSS' | 'INVALID';

// Só para a tela (destacar colunas, pedir motivo). Quem valida de verdade é a API.
export function classifyMove(meta: Meta, from: Stage, to: Stage): MoveKind {
  if (from === to) return 'INVALID';
  const fromMeta = meta.stages.find((s) => s.id === from);
  if (!fromMeta || fromMeta.final) return 'INVALID';
  if (to === 'PERDIDA') return 'LOSS';

  const pipeline = meta.stages.filter((s) => s.inPipeline).map((s) => s.id);
  const fromIndex = pipeline.indexOf(from);
  const toIndex = pipeline.indexOf(to);
  if (toIndex === fromIndex + 1) return 'ADVANCE';
  if (toIndex < fromIndex && meta.allowedReturns[from]?.includes(to)) return 'RETURN';
  return 'INVALID';
}

export function availableMoves(meta: Meta, from: Stage): { to: Stage; kind: Exclude<MoveKind, 'INVALID'> }[] {
  return meta.stages
    .map((s) => ({ to: s.id, kind: classifyMove(meta, from, s.id) }))
    .filter((m): m is { to: Stage; kind: Exclude<MoveKind, 'INVALID'> } => m.kind !== 'INVALID');
}

export function stageLabel(meta: Meta | undefined, stage: Stage): string {
  return meta?.stages.find((s) => s.id === stage)?.label ?? stage;
}
