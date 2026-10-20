'use client';

import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useMemo, useState } from 'react';
import { useMeta, useOpportunities, useSellers } from '@/lib/queries';
import { classifyMove } from '@/lib/stage-moves';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import type { Opportunity, OpportunityFilters, Stage } from '@/lib/types';
import { OpportunityDrawer } from '../opportunity/opportunity-drawer';
import { NewOpportunityButton } from '../opportunity/new-opportunity';
import { Button, EmptyState, ErrorState, inputClass, Spinner } from '../ui/primitives';
import { AttentionSummary } from './attention-summary';
import { OpportunityCard } from './opportunity-card';
import { StageColumn } from './stage-column';
import { useStageMover } from './use-stage-mover';

const EMPTY_FILTERS: OpportunityFilters = { search: '', sellerId: null, needsAttention: false };

export function Board() {
  const meta = useMeta();
  const sellers = useSellers();
  const [filters, setFilters] = useState<OpportunityFilters>(EMPTY_FILTERS);
  const search = useDebouncedValue(filters.search.trim(), 300);
  const query = useOpportunities({ ...filters, search });

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dragging, setDragging] = useState<Opportunity | null>(null);
  const { requestMove, dialog } = useStageMover(meta.data, setSelectedId);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), // clique curto abre o card
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }), // não briga com a rolagem
  );

  const byStage = useMemo(() => {
    const groups = new Map<Stage, Opportunity[]>();
    for (const opportunity of query.data ?? []) {
      groups.set(opportunity.stage, [...(groups.get(opportunity.stage) ?? []), opportunity]);
    }
    return groups;
  }, [query.data]);

  const hasFilters = filters.search !== '' || filters.sellerId !== null || filters.needsAttention;

  function handleDragStart(event: DragStartEvent) {
    setDragging((event.active.data.current?.opportunity as Opportunity) ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const opportunity = event.active.data.current?.opportunity as Opportunity | undefined;
    setDragging(null);
    if (opportunity && event.over) requestMove(opportunity, event.over.id as Stage);
  }

  if (meta.isError || (query.isError && !query.data)) {
    const error = meta.error ?? query.error;
    return (
      <ErrorState
        title="Não foi possível carregar o funil"
        message={error?.message ?? 'Erro desconhecido.'}
        onRetry={() => {
          void meta.refetch();
          void query.refetch();
        }}
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div role="search" className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative flex-1 sm:max-w-sm">
            <span className="sr-only">Pesquisar oportunidades</span>
            <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400">
              ⌕
            </span>
            <input
              type="search"
              value={filters.search}
              onChange={(event) => setFilters((f) => ({ ...f, search: event.target.value }))}
              placeholder="Empresa, código ou brinde"
              className={`${inputClass} pl-8`}
            />
          </label>

          <label className="sm:w-44">
            <span className="sr-only">Filtrar por vendedor</span>
            <select
              value={filters.sellerId ?? ''}
              onChange={(event) => setFilters((f) => ({ ...f, sellerId: event.target.value ? Number(event.target.value) : null }))}
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

          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={filters.needsAttention}
              onChange={(event) => setFilters((f) => ({ ...f, needsAttention: event.target.checked }))}
              className="size-4 accent-red-700"
            />
            Só o que exige atenção
          </label>

          {hasFilters && (
            <Button variant="ghost" onClick={() => setFilters(EMPTY_FILTERS)}>
              Limpar filtros
            </Button>
          )}
          {query.isFetching && !query.isPending && <Spinner label="Atualizando" />}
        </div>

        <NewOpportunityButton onCreated={setSelectedId} />
      </div>

      {query.data && meta.data && (
        <AttentionSummary
          opportunities={query.data}
          today={meta.data.today}
          onlyAttention={filters.needsAttention}
          onToggleAttention={() => setFilters((f) => ({ ...f, needsAttention: !f.needsAttention }))}
        />
      )}

      {query.isPending || meta.isPending ? (
        <BoardSkeleton />
      ) : query.data.length === 0 ? (
        <EmptyState
          title={hasFilters ? 'Nenhuma oportunidade encontrada' : 'Nenhuma oportunidade cadastrada'}
          message={
            hasFilters
              ? filters.needsAttention && !filters.search
                ? 'Nada pedindo atenção com esses filtros. Bom trabalho!'
                : 'Tente outro termo ou remova os filtros.'
              : 'Cadastre a primeira oportunidade para começar.'
          }
          action={hasFilters ? <Button onClick={() => setFilters(EMPTY_FILTERS)}>Limpar filtros</Button> : undefined}
        />
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setDragging(null)}>
          <div className="-mx-4 flex flex-1 gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
            {meta.data.stages.map((stage) => (
              <StageColumn
                key={stage.id}
                stage={stage}
                opportunities={byStage.get(stage.id) ?? []}
                today={meta.data.today}
                onOpen={setSelectedId}
                dropKind={dragging ? (dragging.stage === stage.id ? 'INVALID' : classifyMove(meta.data, dragging.stage, stage.id)) : null}
              />
            ))}
          </div>
          <DragOverlay dropAnimation={null}>
            {dragging && <OpportunityCard opportunity={dragging} today={meta.data.today} onOpen={() => {}} overlay />}
          </DragOverlay>
        </DndContext>
      )}

      {dialog}
      <OpportunityDrawer opportunityId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden" aria-busy="true" aria-label="Carregando o funil">
      {Array.from({ length: 6 }, (_, column) => (
        <div key={column} className="flex w-72 shrink-0 flex-col gap-2 rounded-xl bg-stone-100 p-3 lg:w-auto lg:flex-1">
          <div className="h-4 w-2/3 animate-pulse rounded bg-stone-200" />
          {Array.from({ length: 3 - (column % 3) }, (_, card) => (
            <div key={card} className="h-28 animate-pulse rounded-lg bg-white" />
          ))}
        </div>
      ))}
    </div>
  );
}
