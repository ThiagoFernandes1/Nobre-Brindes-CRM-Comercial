'use client';

import {
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SearchX } from 'lucide-react';
import { useMemo, useState } from 'react';
import { applyFilters, EMPTY_BOARD_FILTERS, setBoardFilters, useBoardFilters } from '@/lib/board-filters';
import { usePreference, writePreference } from '@/lib/preferences';
import { useAllOpportunities, useMeta } from '@/lib/queries';
import { classifyMove } from '@/lib/stage-moves';
import type { Opportunity, Stage } from '@/lib/types';
import { useCurrentSeller } from '../providers';
import { useUi } from '../ui-provider';
import { Button, EmptyState, ErrorState } from '../ui/primitives';
import { AttentionSummary } from './attention-summary';
import { FilterBar, VIEW_PREFERENCE, type BoardView } from './filter-bar';
import { OpportunityCard } from './opportunity-card';
import { OpportunityList } from './opportunity-list';
import { StageColumn } from './stage-column';
import { useStageMover } from './use-stage-mover';

const COLLAPSED_PREFERENCE = 'nobre-crm:collapsed-columns';

// vale a coluna embaixo do ponteiro; sem isso, a coluna recolhida (estreita) perde para a vizinha larga
const collisionDetection: CollisionDetection = (args) => {
  const underPointer = pointerWithin(args);
  return underPointer.length > 0 ? underPointer : rectIntersection(args);
};

export function Board() {
  const meta = useMeta();
  const query = useAllOpportunities();
  const filters = useBoardFilters();
  const { sellerId: currentSellerId } = useCurrentSeller();
  const { openOpportunity } = useUi();
  const view = usePreference(VIEW_PREFERENCE, 'kanban') as BoardView;
  // finais começam recolhidas para sobrar espaço para o que ainda está em negociação
  const collapsedRaw = usePreference(COLLAPSED_PREFERENCE, 'FECHAMENTO,PERDIDA');
  const collapsed = useMemo(() => new Set(collapsedRaw.split(',').filter(Boolean)), [collapsedRaw]);

  const [dragging, setDragging] = useState<Opportunity | null>(null);
  const { requestMove, dialog } = useStageMover(meta.data, openOpportunity);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), // clique curto abre o card
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }), // não briga com a rolagem
  );

  const today = meta.data?.today ?? '';
  const all = useMemo(() => query.data ?? [], [query.data]);
  const ctx = useMemo(() => ({ today, currentSellerId }), [today, currentSellerId]);
  // scoped = busca + vendedor (base das contagens); visible = scoped + filtros rápidos
  const scoped = useMemo(() => applyFilters(all, { ...filters, quick: [] }, ctx), [all, filters, ctx]);
  const visible = useMemo(
    () => applyFilters(scoped, { ...EMPTY_BOARD_FILTERS, quick: filters.quick }, ctx),
    [scoped, filters.quick, ctx],
  );

  const byStage = useMemo(() => {
    const groups = new Map<Stage, Opportunity[]>();
    for (const opportunity of visible) {
      groups.set(opportunity.stage, [...(groups.get(opportunity.stage) ?? []), opportunity]);
    }
    return groups;
  }, [visible]);

  function toggleCollapsed(stage: Stage) {
    const next = new Set(collapsed);
    if (next.has(stage)) next.delete(stage);
    else next.add(stage);
    writePreference(COLLAPSED_PREFERENCE, [...next].join(','));
  }

  function handleDragStart(event: DragStartEvent) {
    setDragging((event.active.data.current?.opportunity as Opportunity) ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const opportunity = event.active.data.current?.opportunity as Opportunity | undefined;
    setDragging(null);
    if (opportunity && event.over) requestMove(opportunity, event.over.id as Stage);
  }

  if (meta.isError || query.isError) {
    return (
      <ErrorState
        title="Não foi possível carregar o funil"
        message={(meta.error ?? query.error)?.message ?? 'Erro desconhecido.'}
        onRetry={() => {
          void meta.refetch();
          void query.refetch();
        }}
      />
    );
  }

  if (meta.isPending || query.isPending) return <BoardSkeleton />;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <AttentionSummary opportunities={scoped} today={today} currentSellerId={currentSellerId} activeQuick={filters.quick} />

      <FilterBar
        filters={filters}
        view={view}
        scoped={scoped}
        visibleCount={visible.length}
        totalCount={all.length}
        today={today}
        currentSellerId={currentSellerId}
      />

      {visible.length === 0 ? (
        all.length === 0 ? (
          <EmptyState title="Nenhuma oportunidade cadastrada" message="Cadastre a primeira oportunidade para começar." />
        ) : (
          <EmptyState
            title={filters.search.trim() ? `Nada encontrado para “${filters.search.trim()}”` : 'Nenhuma oportunidade com esses filtros'}
            message={
              filters.quick.includes('attention') && !filters.search.trim()
                ? 'Nada pedindo atenção agora. Bom trabalho!'
                : 'A busca ignora acentos e procura em empresa, código, brinde, vendedor e anotações. Tente outro termo ou tire algum filtro.'
            }
            action={
              <Button onClick={() => setBoardFilters(EMPTY_BOARD_FILTERS)}>
                <SearchX className="size-4" aria-hidden />
                Limpar filtros
              </Button>
            }
          />
        )
      ) : view === 'list' ? (
        <OpportunityList opportunities={visible} meta={meta.data} query={filters.search} onOpen={openOpportunity} />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setDragging(null)}>
          <div className="relative -mx-4 flex flex-1 snap-x gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
            {meta.data.stages.map((stage) => (
              <StageColumn
                key={stage.id}
                stage={stage}
                opportunities={byStage.get(stage.id) ?? []}
                today={today}
                query={filters.search}
                onOpen={openOpportunity}
                collapsed={collapsed.has(stage.id)}
                onToggleCollapsed={() => toggleCollapsed(stage.id)}
                dropKind={dragging ? (dragging.stage === stage.id ? 'INVALID' : classifyMove(meta.data, dragging.stage, stage.id)) : null}
              />
            ))}
          </div>
          <DragOverlay dropAnimation={null}>
            {dragging && <OpportunityCard opportunity={dragging} today={today} onOpen={() => {}} overlay />}
          </DragOverlay>
        </DndContext>
      )}

      {dialog}
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Carregando o funil">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-white" />
        ))}
      </div>
      <div className="h-10 animate-pulse rounded-lg bg-white" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 6 }, (_, column) => (
          <div key={column} className="flex w-72 shrink-0 flex-col gap-2 rounded-xl bg-stone-100 p-3 lg:w-auto lg:flex-1">
            <div className="h-4 w-2/3 animate-pulse rounded bg-stone-200" />
            {Array.from({ length: 3 - (column % 3) }, (_, card) => (
              <div key={card} className="h-28 animate-pulse rounded-lg bg-white" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
