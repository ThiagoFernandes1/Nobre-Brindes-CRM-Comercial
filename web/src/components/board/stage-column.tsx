'use client';

import { useDroppable } from '@dnd-kit/core';
import { ChevronsLeft, ChevronsRight } from 'lucide-react';
import { formatCurrency, pluralize } from '@/lib/format';
import type { MoveKind } from '@/lib/stage-moves';
import { STAGE_DOT } from '@/lib/stage-style';
import type { Opportunity, StageMeta } from '@/lib/types';
import { OpportunityCard } from './opportunity-card';

const DROP_HINT: Record<Exclude<MoveKind, 'INVALID'>, string> = {
  ADVANCE: 'Soltar para avançar',
  RETURN: 'Soltar para voltar (pede motivo)',
  LOSS: 'Soltar para marcar como perdida (pede motivo)',
};

interface StageColumnProps {
  stage: StageMeta;
  opportunities: Opportunity[];
  today: string;
  query: string;
  onOpen: (id: number) => void;
  /** null quando nada está sendo arrastado */
  dropKind: MoveKind | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export function StageColumn({ stage, opportunities, today, query, onOpen, dropKind, collapsed, onToggleCollapsed }: StageColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = opportunities.reduce((sum, o) => sum + (o.estimatedValue ?? 0), 0);
  const needAttention = opportunities.filter((o) => o.attention.level !== 'OK').length;

  const dragging = dropKind !== null;
  const canDrop = dragging && dropKind !== 'INVALID';
  const dropStyle = `${isOver && canDrop ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-600/30' : 'border-transparent'} ${
    dragging && !canDrop ? 'opacity-40' : ''
  } ${canDrop && !isOver ? 'border-dashed border-brand-600/50' : ''}`;

  // recolhida continua sendo um alvo de soltar: dá para arrastar para "Perdida" sem abrir a coluna
  if (collapsed) {
    return (
      <section
        ref={setNodeRef}
        aria-label={`${stage.label}: ${pluralize(opportunities.length, 'oportunidade')} (recolhida)`}
        className={`flex w-12 shrink-0 snap-start flex-col items-center gap-3 rounded-xl border bg-stone-100 py-3 transition-colors ${dropStyle}`}
      >
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="rounded-md p-1 text-stone-500 hover:bg-stone-200 hover:text-stone-800"
          aria-label={`Expandir ${stage.label}`}
          title={`Expandir ${stage.label}`}
        >
          <ChevronsRight className="size-4" />
        </button>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-stone-600 ring-1 ring-stone-200">
          {opportunities.length}
        </span>
        <span className="flex items-center gap-2 text-sm font-semibold text-stone-600 [writing-mode:vertical-rl]">
          <span className={`size-2 rounded-full ${STAGE_DOT[stage.id]}`} aria-hidden />
          {stage.label}
        </span>
      </section>
    );
  }

  return (
    <section
      ref={setNodeRef}
      aria-label={`${stage.label}: ${pluralize(opportunities.length, 'oportunidade')}`}
      className={`flex w-[17rem] shrink-0 snap-start flex-col rounded-xl border bg-stone-100 transition-colors lg:w-auto lg:min-w-52 lg:flex-1 ${dropStyle}`}
    >
      <header className="px-3 pb-2 pt-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-stone-800">
            <span className={`size-2 shrink-0 rounded-full ${STAGE_DOT[stage.id]}`} aria-hidden />
            {stage.label}
          </h2>
          <div className="flex items-center gap-1">
            <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-stone-600 ring-1 ring-stone-200">
              {opportunities.length}
            </span>
            <button
              type="button"
              onClick={onToggleCollapsed}
              className="rounded-md p-1 text-stone-400 hover:bg-stone-200 hover:text-stone-700"
              aria-label={`Recolher ${stage.label}`}
              title="Recolher coluna"
            >
              <ChevronsLeft className="size-4" />
            </button>
          </div>
        </div>
        <p className="mt-0.5 text-xs tabular-nums text-stone-500">
          {formatCurrency(total)}
          {needAttention > 0 && !stage.final && <span className="text-red-700"> · {needAttention} pedem atenção</span>}
        </p>
      </header>

      <div className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-3">
        {canDrop && (
          <p className="rounded-md border-2 border-dashed border-brand-600/40 px-2 py-2 text-center text-xs font-medium text-brand-700">
            {DROP_HINT[dropKind as Exclude<MoveKind, 'INVALID'>]}
          </p>
        )}
        {opportunities.map((opportunity) => (
          <OpportunityCard key={opportunity.id} opportunity={opportunity} today={today} query={query} onOpen={onOpen} />
        ))}
        {opportunities.length === 0 && !canDrop && (
          <p className="px-2 py-6 text-center text-xs text-stone-400">Nenhuma oportunidade</p>
        )}
      </div>
    </section>
  );
}
