'use client';

import { useDraggable } from '@dnd-kit/core';
import { CalendarDays, Clock, Gift } from 'lucide-react';
import { formatCurrency, formatShortDate, relativeDay } from '@/lib/format';
import type { Opportunity } from '@/lib/types';
import { Highlight } from '../ui/highlight';
import { SeverityBadge } from '../ui/primitives';

const LEVEL_BORDER = {
  CRITICAL: 'border-l-red-600',
  WARNING: 'border-l-amber-500',
  OK: 'border-l-transparent',
} as const;

interface CardProps {
  opportunity: Opportunity;
  today: string;
  query?: string;
  onOpen: (id: number) => void;
  overlay?: boolean;
}

export function OpportunityCard({ opportunity, today, query = '', onOpen, overlay = false }: CardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: opportunity.id,
    data: { opportunity },
    disabled: overlay,
  });
  const { attention } = opportunity;
  const [mainFlag, ...otherFlags] = attention.flags;
  const next = attention.nextFollowUp;
  const firstItem = opportunity.items[0];
  const isClosed = opportunity.stage === 'FECHAMENTO' || opportunity.stage === 'PERDIDA';

  return (
    <article
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      // pelo teclado abre o detalhe, que tem os botões de mover
      role="button"
      tabIndex={0}
      aria-label={`${opportunity.code} ${opportunity.companyName}. ${mainFlag ? mainFlag.message : 'Em dia'}. Abrir detalhes`}
      onClick={() => onOpen(opportunity.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(opportunity.id);
        }
      }}
      className={`group cursor-grab touch-manipulation select-none rounded-lg border border-l-4 border-stone-200 bg-white p-3 text-left shadow-sm transition hover:-translate-y-px hover:border-stone-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 active:cursor-grabbing ${LEVEL_BORDER[attention.level]} ${isDragging ? 'opacity-30' : ''} ${overlay ? 'rotate-2 shadow-xl' : ''} ${isClosed ? 'opacity-80' : ''}`}
    >
      <div className="flex items-baseline justify-between gap-2 text-xs text-stone-500">
        <span className="font-mono">
          <Highlight text={opportunity.code} query={query} />
        </span>
        <span>
          <Highlight text={opportunity.seller.name} query={query} />
        </span>
      </div>

      <div className="mt-1 flex items-baseline justify-between gap-2">
        <h3 className="font-semibold leading-snug text-stone-900">
          <Highlight text={opportunity.companyName} query={query} />
        </h3>
        <span
          className={`shrink-0 text-sm font-semibold tabular-nums ${opportunity.estimatedValue === null ? 'text-stone-400' : 'text-stone-900'}`}
        >
          {formatCurrency(opportunity.estimatedValue)}
        </span>
      </div>

      <p className="mt-0.5 flex items-start gap-1 text-sm text-stone-600">
        <Gift className="mt-0.5 size-3.5 shrink-0 text-stone-400" aria-hidden />
        <span>
          {firstItem ? (
            <>
              <Highlight text={firstItem.description} query={query} /> · {firstItem.quantity.toLocaleString('pt-BR')} un.
            </>
          ) : (
            <span className="italic text-stone-400">Sem item de brinde</span>
          )}
          {opportunity.items.length > 1 && ` +${opportunity.items.length - 1}`}
        </span>
      </p>

      {mainFlag && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <SeverityBadge severity={mainFlag.severity}>{mainFlag.message}</SeverityBadge>
          {otherFlags.length > 0 && (
            <span className="text-xs text-stone-500" title={otherFlags.map((f) => f.message).join('\n')}>
              +{otherFlags.length} {otherFlags.length === 1 ? 'alerta' : 'alertas'}
            </span>
          )}
        </div>
      )}

      {opportunity.stage === 'PERDIDA' && opportunity.lossReason && (
        <p className="mt-2 line-clamp-2 text-xs text-stone-500">Motivo: {opportunity.lossReason}</p>
      )}

      {(next || opportunity.eventDate) && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 border-t border-stone-100 pt-2 text-xs text-stone-600">
          {next && (
            <span
              className={`flex items-center gap-1 ${next.daysLate > 0 ? 'font-semibold text-red-700' : next.dueDate === today ? 'font-semibold text-brand-700' : ''}`}
            >
              <Clock className="size-3.5" aria-hidden />
              <span className="sr-only">Retorno:</span>
              {next.daysLate > 0 ? `atrasado ${next.daysLate}d` : `retorno ${relativeDay(next.dueDate, today)}`}
            </span>
          )}
          {opportunity.eventDate && (
            <span className="flex items-center gap-1">
              <CalendarDays className="size-3.5" aria-hidden />
              <span className="sr-only">Evento:</span>
              evento {formatShortDate(opportunity.eventDate)}
            </span>
          )}
        </div>
      )}
    </article>
  );
}
