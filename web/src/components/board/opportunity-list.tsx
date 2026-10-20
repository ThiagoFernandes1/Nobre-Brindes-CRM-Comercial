'use client';

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatCurrency, formatShortDate, relativeDay } from '@/lib/format';
import { stageLabel } from '@/lib/stage-moves';
import { STAGE_DOT } from '@/lib/stage-style';
import type { Meta, Opportunity } from '@/lib/types';
import { Highlight } from '../ui/highlight';
import { SeverityBadge } from '../ui/primitives';

type SortKey = 'urgency' | 'company' | 'stage' | 'seller' | 'value' | 'followUp' | 'event';

const LEVEL_BORDER = { CRITICAL: 'border-l-red-600', WARNING: 'border-l-amber-500', OK: 'border-l-transparent' } as const;

interface OpportunityListProps {
  opportunities: Opportunity[];
  meta: Meta;
  query: string;
  onOpen: (id: number) => void;
}

export function OpportunityList({ opportunities, meta, query, onOpen }: OpportunityListProps) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'urgency', dir: 1 });

  const rows = useMemo(() => {
    // a API já devolve por urgência; a posição original serve de critério
    const urgency = new Map(opportunities.map((o, i) => [o.id, i]));
    const stageOrder = new Map(meta.stages.map((s, i) => [s.id, i]));
    const last = '9999-12-31';
    const compare: Record<SortKey, (a: Opportunity, b: Opportunity) => number> = {
      urgency: (a, b) => urgency.get(a.id)! - urgency.get(b.id)!,
      company: (a, b) => a.companyName.localeCompare(b.companyName, 'pt-BR'),
      stage: (a, b) => stageOrder.get(a.stage)! - stageOrder.get(b.stage)!,
      seller: (a, b) => a.seller.name.localeCompare(b.seller.name, 'pt-BR'),
      value: (a, b) => (a.estimatedValue ?? -1) - (b.estimatedValue ?? -1),
      followUp: (a, b) => (a.attention.nextFollowUp?.dueDate ?? last).localeCompare(b.attention.nextFollowUp?.dueDate ?? last),
      event: (a, b) => (a.eventDate ?? last).localeCompare(b.eventDate ?? last),
    };
    return [...opportunities].sort((a, b) => compare[sort.key](a, b) * sort.dir);
  }, [opportunities, meta.stages, sort]);

  function toggleSort(key: SortKey) {
    // valor começa do maior; o resto, do menor
    setSort((current) => (current.key === key ? { key, dir: current.dir === 1 ? -1 : 1 } : { key, dir: key === 'value' ? -1 : 1 }));
  }

  const header = (key: SortKey, label: string, align: 'left' | 'right' = 'left') => {
    const isSorted = sort.key === key;
    const Icon = !isSorted ? ArrowUpDown : sort.dir === 1 ? ArrowUp : ArrowDown;
    return (
      <th
        scope="col"
        aria-sort={isSorted ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
        className={`px-3 py-2 font-medium ${align === 'right' ? 'text-right' : 'text-left'}`}
      >
        <button
          type="button"
          onClick={() => toggleSort(key)}
          className={`inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-stone-200/70 ${isSorted ? 'text-stone-900' : ''}`}
        >
          {label}
          <Icon className={`size-3.5 ${isSorted ? 'text-brand-700' : 'text-stone-400'}`} aria-hidden />
        </button>
      </th>
    );
  };

  return (
    <div className="relative overflow-x-auto rounded-xl border border-stone-200 bg-white">
      <table className="w-full min-w-[960px] text-sm">
        <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
          <tr>
            {header('urgency', 'Situação')}
            {header('company', 'Oportunidade')}
            {header('stage', 'Etapa')}
            {header('seller', 'Vendedor')}
            {header('value', 'Valor', 'right')}
            {header('followUp', 'Próximo retorno')}
            {header('event', 'Evento')}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {rows.map((o) => {
            const [flag, ...others] = o.attention.flags;
            const next = o.attention.nextFollowUp;
            return (
              <tr
                key={o.id}
                onClick={() => onOpen(o.id)}
                className={`cursor-pointer border-l-4 hover:bg-stone-50 ${LEVEL_BORDER[o.attention.level]}`}
              >
                <td className="px-3 py-2.5">
                  {flag ? (
                    <span className="flex flex-wrap items-center gap-1">
                      <SeverityBadge severity={flag.severity}>{flag.message}</SeverityBadge>
                      {others.length > 0 && <span className="text-xs text-stone-500">+{others.length}</span>}
                    </span>
                  ) : o.stage === 'FECHAMENTO' || o.stage === 'PERDIDA' ? (
                    <span className="text-xs text-stone-400">Encerrada</span>
                  ) : (
                    <span className="text-xs text-brand-700">Em dia</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(o.id);
                    }}
                    className="text-left font-medium text-stone-900 hover:underline"
                  >
                    <Highlight text={o.companyName} query={query} />
                  </button>
                  <p className="text-xs text-stone-500">
                    <span className="font-mono">
                      <Highlight text={o.code} query={query} />
                    </span>
                    {o.items[0] && (
                      <>
                        {' · '}
                        <Highlight text={o.items[0].description} query={query} />
                      </>
                    )}
                  </p>
                </td>
                <td className="px-3 py-2.5">
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <span className={`size-2 rounded-full ${STAGE_DOT[o.stage]}`} aria-hidden />
                    {stageLabel(meta, o.stage)}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <Highlight text={o.seller.name} query={query} />
                </td>
                <td className="px-3 py-2.5 text-right font-medium tabular-nums">{formatCurrency(o.estimatedValue)}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {next ? (
                    <span className={next.daysLate > 0 ? 'font-medium text-red-700' : next.dueDate === meta.today ? 'font-medium text-brand-700' : ''}>
                      {next.daysLate > 0 ? `atrasado ${next.daysLate}d` : relativeDay(next.dueDate, meta.today)}
                      <span className="ml-1 text-xs font-normal text-stone-400">{formatShortDate(next.dueDate)}</span>
                    </span>
                  ) : (
                    <span className="text-stone-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {o.eventDate ? formatShortDate(o.eventDate) : <span className="text-stone-400">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
