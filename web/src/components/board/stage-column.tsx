'use client';

import { useDroppable } from '@dnd-kit/core';
import { formatCurrency, pluralize } from '@/lib/format';
import type { MoveKind } from '@/lib/stage-moves';
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
  onOpen: (id: number) => void;
  /** Durante um arraste: que tipo de movimento seria soltar aqui (null = nada sendo arrastado). */
  dropKind: MoveKind | null;
}

export function StageColumn({ stage, opportunities, today, onOpen, dropKind }: StageColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = opportunities.reduce((sum, o) => sum + (o.estimatedValue ?? 0), 0);
  const needAttention = opportunities.filter((o) => o.attention.level !== 'OK').length;

  const dragging = dropKind !== null;
  const canDrop = dragging && dropKind !== 'INVALID';

  return (
    <section
      ref={setNodeRef}
      aria-label={`${stage.label}: ${pluralize(opportunities.length, 'oportunidade')}`}
      className={`flex w-72 shrink-0 flex-col rounded-xl border transition-colors lg:w-auto lg:min-w-52 lg:flex-1 ${
        stage.final ? 'bg-stone-100/70' : 'bg-stone-100'
      } ${isOver && canDrop ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-600/30' : 'border-transparent'} ${
        dragging && !canDrop ? 'opacity-40' : ''
      }`}
    >
      <header className="px-3 pb-2 pt-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className={`text-sm font-semibold ${stage.id === 'PERDIDA' ? 'text-stone-500' : 'text-stone-800'}`}>{stage.label}</h2>
          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-stone-600 ring-1 ring-stone-200">
            {opportunities.length}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-stone-500">
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
          <OpportunityCard key={opportunity.id} opportunity={opportunity} today={today} onOpen={onOpen} />
        ))}
        {opportunities.length === 0 && !canDrop && (
          <p className="px-2 py-6 text-center text-xs text-stone-400">Nenhuma oportunidade</p>
        )}
      </div>
    </section>
  );
}
