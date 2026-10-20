'use client';

import { CalendarCheck, CalendarClock, Clock, PhoneCall, Search, X } from 'lucide-react';
import { useState } from 'react';
import { formatCurrency, formatDate, pluralize, relativeDay } from '@/lib/format';
import { useAgenda, useMeta, useSellers } from '@/lib/queries';
import { fold } from '@/lib/search';
import { stageLabel } from '@/lib/stage-moves';
import { STAGE_DOT } from '@/lib/stage-style';
import type { AgendaEntry, Meta } from '@/lib/types';
import { ContactForm } from '../opportunity/contact-form';
import { useCurrentSeller } from '../providers';
import { useUi } from '../ui-provider';
import { Highlight } from '../ui/highlight';
import { Button, EmptyState, ErrorState, inputClass } from '../ui/primitives';

const BUCKETS = [
  { id: 'OVERDUE', title: 'Atrasados', empty: 'Nenhum retorno atrasado.', tone: 'text-red-700', icon: Clock },
  { id: 'TODAY', title: 'Para hoje', empty: 'Nada agendado para hoje.', tone: 'text-brand-700', icon: CalendarCheck },
  { id: 'UPCOMING', title: 'Próximos 7 dias', empty: 'Nada nos próximos dias.', tone: 'text-stone-700', icon: CalendarClock },
] as const;

function matches(entry: AgendaEntry, query: string): boolean {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  const o = entry.opportunity;
  const text = fold(`${o.code} ${o.companyName} ${o.seller.name} ${entry.title}`);
  return terms.every((t) => text.includes(t));
}

export function Agenda() {
  const { sellerId: currentSellerId } = useCurrentSeller();
  // null = segue o vendedor escolhido no cabeçalho
  const [chosenSellerId, setChosenSellerId] = useState<number | 'ALL' | null>(null);
  const sellerId = chosenSellerId === 'ALL' ? null : (chosenSellerId ?? currentSellerId);
  const [search, setSearch] = useState('');
  const sellers = useSellers();
  const meta = useMeta();
  const agenda = useAgenda(sellerId);
  const { openOpportunity } = useUi();

  const entries = (agenda.data ?? []).filter((e) => matches(e, search));

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Retornos</h1>
        <p className="text-sm text-stone-600">
          Cada negociação aberta tem um próximo retorno. Ao registrar o contato, o retorno é concluído e o próximo já é agendado.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Pesquisar nos retornos</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" aria-hidden />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Empresa, código ou vendedor"
            className={`${inputClass} pl-9 pr-9`}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
              aria-label="Limpar busca"
            >
              <X className="size-4" />
            </button>
          )}
        </label>
        <label className="sm:w-52">
          <span className="sr-only">Vendedor</span>
          <select
            value={sellerId ?? ''}
            onChange={(e) => setChosenSellerId(e.target.value ? Number(e.target.value) : 'ALL')}
            className={inputClass}
          >
            <option value="">Todos os vendedores</option>
            {sellers.data?.map((seller) => (
              <option key={seller.id} value={seller.id}>
                {seller.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {agenda.isError || meta.isError ? (
        <ErrorState
          title="Não foi possível carregar os retornos"
          message={(agenda.error ?? meta.error)?.message ?? ''}
          onRetry={() => void agenda.refetch()}
        />
      ) : agenda.isPending || meta.isPending ? (
        <div className="space-y-2" aria-busy="true" aria-label="Carregando retornos">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-white" />
          ))}
        </div>
      ) : agenda.data.length === 0 ? (
        <EmptyState title="Nenhum retorno pendente" message="Todas as negociações deste filtro estão em dia." />
      ) : entries.length === 0 ? (
        <EmptyState
          title={`Nada encontrado para “${search.trim()}”`}
          action={<Button onClick={() => setSearch('')}>Limpar busca</Button>}
        />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {BUCKETS.map((bucket) => {
              const Icon = bucket.icon;
              const count = entries.filter((e) => e.bucket === bucket.id).length;
              return (
                <a
                  key={bucket.id}
                  href={`#bucket-${bucket.id}`}
                  className="rounded-xl border border-stone-200 bg-white p-3 hover:border-stone-400"
                >
                  <p className={`flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide ${bucket.tone}`}>
                    <Icon className="size-3.5" aria-hidden />
                    {bucket.title}
                  </p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{count}</p>
                </a>
              );
            })}
          </div>

          {BUCKETS.map((bucket) => {
            const bucketEntries = entries.filter((e) => e.bucket === bucket.id);
            return (
              <section key={bucket.id} id={`bucket-${bucket.id}`} aria-labelledby={`bucket-title-${bucket.id}`} className="scroll-mt-20">
                <h2 id={`bucket-title-${bucket.id}`} className={`text-sm font-semibold uppercase tracking-wide ${bucket.tone}`}>
                  {bucket.title} <span className="font-normal text-stone-500">({bucketEntries.length})</span>
                </h2>
                {bucketEntries.length === 0 ? (
                  <p className="mt-1 text-sm text-stone-500">{bucket.empty}</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {bucketEntries.map((entry) => (
                      <AgendaRow key={entry.id} entry={entry} meta={meta.data} query={search} onOpen={openOpportunity} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}

          <p className="text-xs text-stone-500">{pluralize(entries.length, 'retorno')} na lista.</p>
        </>
      )}
    </div>
  );
}

function AgendaRow({ entry, meta, query, onOpen }: { entry: AgendaEntry; meta: Meta; query: string; onOpen: (id: number) => void }) {
  const [registering, setRegistering] = useState(false);
  const { opportunity } = entry;

  return (
    <li
      className={`rounded-xl border border-l-4 bg-white p-3 transition hover:shadow-sm ${
        entry.bucket === 'OVERDUE' ? 'border-red-200 border-l-red-600' : entry.bucket === 'TODAY' ? 'border-stone-200 border-l-brand-700' : 'border-stone-200 border-l-stone-300'
      }`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" onClick={() => onOpen(opportunity.id)} className="min-w-0 text-left">
          <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-stone-500">
            <span className="font-mono">
              <Highlight text={opportunity.code} query={query} />
            </span>
            ·
            <span className="inline-flex items-center gap-1">
              <span className={`size-1.5 rounded-full ${STAGE_DOT[opportunity.stage]}`} aria-hidden />
              {stageLabel(meta, opportunity.stage)}
            </span>
            · <Highlight text={opportunity.seller.name} query={query} /> · {formatCurrency(opportunity.estimatedValue)}
          </p>
          <p className="font-semibold text-stone-900 hover:underline">
            <Highlight text={opportunity.companyName} query={query} />
          </p>
          <p className="text-sm text-stone-700">{entry.title}</p>
        </button>
        <div className="flex shrink-0 items-center gap-3">
          <span className={`text-sm ${entry.bucket === 'OVERDUE' ? 'font-semibold text-red-700' : 'text-stone-600'}`}>
            {entry.bucket === 'OVERDUE'
              ? `atrasado há ${pluralize(entry.daysLate, 'dia')}`
              : `${relativeDay(entry.dueDate, meta.today)} · ${formatDate(entry.dueDate).slice(0, 5)}`}
          </span>
          {!registering && (
            <Button variant={entry.bucket === 'UPCOMING' ? 'secondary' : 'primary'} onClick={() => setRegistering(true)}>
              <PhoneCall className="size-4" aria-hidden />
              Registrar contato
            </Button>
          )}
        </div>
      </div>
      {registering && (
        <div className="mt-3">
          <ContactForm opportunityId={opportunity.id} today={meta.today} onDone={() => setRegistering(false)} />
        </div>
      )}
    </li>
  );
}
