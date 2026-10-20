'use client';

import { useState } from 'react';
import { formatCurrency, formatDate, pluralize, relativeDay } from '@/lib/format';
import { useAgenda, useMeta, useSellers } from '@/lib/queries';
import { stageLabel } from '@/lib/stage-moves';
import type { AgendaEntry, Meta } from '@/lib/types';
import { OpportunityDrawer } from '../opportunity/opportunity-drawer';
import { ContactForm } from '../opportunity/contact-form';
import { useCurrentSeller } from '../providers';
import { Button, EmptyState, ErrorState, inputClass } from '../ui/primitives';

const BUCKETS: { id: AgendaEntry['bucket']; title: string; empty: string; tone: string }[] = [
  { id: 'OVERDUE', title: 'Atrasados', empty: 'Nenhum retorno atrasado.', tone: 'text-red-700' },
  { id: 'TODAY', title: 'Para hoje', empty: 'Nada agendado para hoje.', tone: 'text-brand-700' },
  { id: 'UPCOMING', title: 'Próximos 7 dias', empty: 'Nada nos próximos dias.', tone: 'text-stone-700' },
];

export function Agenda() {
  const { sellerId: currentSellerId } = useCurrentSeller();
  // null = ainda não escolhido nesta tela: segue o "Você é" do cabeçalho
  const [chosenSellerId, setChosenSellerId] = useState<number | 'ALL' | null>(null);
  const sellerId = chosenSellerId === 'ALL' ? null : (chosenSellerId ?? currentSellerId);
  const sellers = useSellers();
  const meta = useMeta();
  const agenda = useAgenda(sellerId);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Retornos</h1>
          <p className="max-w-xl text-sm text-stone-600">
            Lista montada automaticamente: cada negociação aberta tem um próximo retorno, calculado pela etapa, pela data
            combinada com o cliente, pelo vencimento da proposta e pelo prazo de produção do evento. Registrar o contato
            conclui o retorno e agenda o seguinte.
          </p>
        </div>
        <label className="sm:w-52">
          <span className="text-xs font-medium text-stone-600">Vendedor</span>
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
      ) : (
        BUCKETS.map((bucket) => {
          const entries = agenda.data.filter((e) => e.bucket === bucket.id);
          return (
            <section key={bucket.id} aria-labelledby={`bucket-${bucket.id}`}>
              <h2 id={`bucket-${bucket.id}`} className={`text-sm font-semibold uppercase tracking-wide ${bucket.tone}`}>
                {bucket.title} <span className="font-normal text-stone-500">({entries.length})</span>
              </h2>
              {entries.length === 0 ? (
                <p className="mt-1 text-sm text-stone-500">{bucket.empty}</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {entries.map((entry) => (
                    <AgendaRow key={entry.id} entry={entry} meta={meta.data} onOpen={setSelectedId} />
                  ))}
                </ul>
              )}
            </section>
          );
        })
      )}

      {agenda.data && agenda.data.length > 0 && (
        <p className="text-xs text-stone-500">{pluralize(agenda.data.length, 'retorno')} no total.</p>
      )}

      <OpportunityDrawer opportunityId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}

function AgendaRow({ entry, meta, onOpen }: { entry: AgendaEntry; meta: Meta; onOpen: (id: number) => void }) {
  const [registering, setRegistering] = useState(false);
  const { opportunity } = entry;

  return (
    <li
      className={`rounded-xl border bg-white p-3 ${entry.bucket === 'OVERDUE' ? 'border-l-4 border-red-200 border-l-red-600' : 'border-stone-200'}`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" onClick={() => onOpen(opportunity.id)} className="min-w-0 text-left">
          <p className="text-xs text-stone-500">
            <span className="font-mono">{opportunity.code}</span> · {stageLabel(meta, opportunity.stage)} · {opportunity.seller.name} ·{' '}
            {formatCurrency(opportunity.estimatedValue)}
          </p>
          <p className="font-semibold text-stone-900 hover:underline">{opportunity.companyName}</p>
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
