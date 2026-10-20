'use client';

import { CalendarClock, Clock, TriangleAlert, Wallet, type LucideIcon } from 'lucide-react';
import { QUICK_FILTERS, toggleQuickFilter, type QuickFilterId } from '@/lib/board-filters';
import { formatCurrency, pluralize } from '@/lib/format';
import type { Opportunity } from '@/lib/types';

interface AttentionSummaryProps {
  opportunities: Opportunity[];
  today: string;
  currentSellerId: number | null;
  activeQuick: QuickFilterId[];
}

export function AttentionSummary({ opportunities, today, currentSellerId, activeQuick }: AttentionSummaryProps) {
  const ctx = { today, currentSellerId };
  const count = (id: QuickFilterId) => opportunities.filter((o) => QUICK_FILTERS[id].test(o, ctx)).length;
  const open = opportunities.filter((o) => o.stage !== 'FECHAMENTO' && o.stage !== 'PERDIDA');
  const critical = open.filter((o) => o.attention.level === 'CRITICAL').length;
  const attention = count('attention');
  const pipeline = open.reduce((sum, o) => sum + (o.estimatedValue ?? 0), 0);

  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <FilterTile
        id="attention"
        icon={TriangleAlert}
        label="Exigem atenção"
        value={attention}
        note={attention === 0 ? 'Tudo em dia' : `${critical} críticas · ${attention - critical} alertas`}
        tone={critical > 0 ? 'red' : attention > 0 ? 'amber' : 'green'}
        active={activeQuick.includes('attention')}
      />
      <FilterTile
        id="overdue"
        icon={Clock}
        label="Retornos atrasados"
        value={count('overdue')}
        note="sem contato no prazo"
        tone={count('overdue') > 0 ? 'red' : 'neutral'}
        active={activeQuick.includes('overdue')}
      />
      <FilterTile
        id="today"
        icon={CalendarClock}
        label="Retornos para hoje"
        value={count('today')}
        note="agenda do dia"
        tone="neutral"
        active={activeQuick.includes('today')}
      />
      <div className="rounded-xl border border-stone-200 bg-white p-3">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-stone-500">
          <Wallet className="size-3.5" aria-hidden />
          Em negociação
        </p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-stone-900">{formatCurrency(pipeline)}</p>
        <p className="text-xs text-stone-500">{pluralize(open.length, 'oportunidade aberta', 'oportunidades abertas')}</p>
      </div>
    </div>
  );
}

const TONES = {
  red: { idle: 'border-red-200 bg-red-50', value: 'text-red-700' },
  amber: { idle: 'border-amber-200 bg-amber-50', value: 'text-amber-800' },
  green: { idle: 'border-brand-100 bg-brand-50', value: 'text-brand-800' },
  neutral: { idle: 'border-stone-200 bg-white', value: 'text-stone-900' },
};

function FilterTile({
  id,
  icon: Icon,
  label,
  value,
  note,
  tone,
  active,
}: {
  id: QuickFilterId;
  icon: LucideIcon;
  label: string;
  value: number;
  note: string;
  tone: keyof typeof TONES;
  active: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => toggleQuickFilter(id)}
      title={active ? 'Clique para remover o filtro' : 'Clique para filtrar o quadro'}
      className={`group rounded-xl border p-3 text-left transition hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${
        active ? 'border-brand-700 bg-white ring-2 ring-brand-700' : `${TONES[tone].idle} hover:border-stone-400`
      }`}
    >
      <p className="flex items-center justify-between gap-1.5 text-xs font-medium uppercase tracking-wide text-stone-500">
        <span className="flex items-center gap-1.5">
          <Icon className="size-3.5" aria-hidden />
          {label}
        </span>
        <span className={`normal-case tracking-normal ${active ? 'text-brand-700' : 'text-stone-400 group-hover:text-stone-600'}`}>
          {active ? 'filtrando ✓' : 'filtrar'}
        </span>
      </p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${TONES[tone].value}`}>{value}</p>
      <p className="text-xs text-stone-500">{note}</p>
    </button>
  );
}
