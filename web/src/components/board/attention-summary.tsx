import Link from 'next/link';
import { formatCurrency, pluralize } from '@/lib/format';
import type { Opportunity } from '@/lib/types';

interface AttentionSummaryProps {
  opportunities: Opportunity[];
  today: string;
  onlyAttention: boolean;
  onToggleAttention: () => void;
}

/** Responde de cara: "o que eu preciso trabalhar hoje?". */
export function AttentionSummary({ opportunities, today, onlyAttention, onToggleAttention }: AttentionSummaryProps) {
  const open = opportunities.filter((o) => o.stage !== 'FECHAMENTO' && o.stage !== 'PERDIDA');
  const critical = open.filter((o) => o.attention.level === 'CRITICAL').length;
  const warning = open.filter((o) => o.attention.level === 'WARNING').length;
  const overdue = open.filter((o) => (o.attention.nextFollowUp?.daysLate ?? 0) > 0).length;
  const dueToday = open.filter((o) => o.attention.nextFollowUp?.dueDate === today).length;
  const pipeline = open.reduce((sum, o) => sum + (o.estimatedValue ?? 0), 0);

  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <div
        className={`col-span-2 flex items-center justify-between gap-3 rounded-xl border p-3 lg:col-span-1 ${
          critical > 0 ? 'border-red-200 bg-red-50' : warning > 0 ? 'border-amber-200 bg-amber-50' : 'border-brand-100 bg-brand-50'
        }`}
      >
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-stone-600">Exigem atenção</p>
          <p className="text-2xl font-semibold text-stone-900">{critical + warning}</p>
          <p className="text-xs text-stone-600">
            {critical + warning === 0 ? 'Tudo em dia' : `${critical} críticas · ${warning} alertas`}
          </p>
        </div>
        {(critical + warning > 0 || onlyAttention) && (
          <button
            type="button"
            onClick={onToggleAttention}
            aria-pressed={onlyAttention}
            className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-stone-800 shadow-sm ring-1 ring-stone-200 hover:bg-stone-50"
          >
            {onlyAttention ? 'Ver todas' : 'Ver só essas'}
          </button>
        )}
      </div>

      <Stat label="Retornos atrasados" value={overdue} tone={overdue > 0 ? 'text-red-700' : undefined} />
      <Link href="/retornos" className="rounded-xl border border-stone-200 bg-white p-3 hover:border-brand-600">
        <p className="text-xs font-medium uppercase tracking-wide text-stone-600">Retornos para hoje</p>
        <p className="text-2xl font-semibold text-stone-900">{dueToday}</p>
        <p className="text-xs text-brand-700">Abrir minha agenda →</p>
      </Link>
      <Stat
        className="col-span-2 lg:col-span-1"
        label="Em negociação"
        value={formatCurrency(pipeline)}
        note={pluralize(open.length, 'oportunidade aberta', 'oportunidades abertas')}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  tone,
  className = '',
}: {
  label: string;
  value: string | number;
  note?: string;
  tone?: string;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-stone-200 bg-white p-3 ${className}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-stone-600">{label}</p>
      <p className={`text-2xl font-semibold ${tone ?? 'text-stone-900'}`}>{value}</p>
      {note && <p className="text-xs text-stone-500">{note}</p>}
    </div>
  );
}
