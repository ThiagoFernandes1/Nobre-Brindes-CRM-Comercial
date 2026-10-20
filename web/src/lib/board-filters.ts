'use client';

import { useSyncExternalStore } from 'react';
import { matchesSearch } from './search';
import type { Opportunity } from './types';

export type QuickFilterId = 'attention' | 'overdue' | 'today' | 'mine' | 'critical' | 'proposal' | 'event';

interface FilterContext {
  today: string;
  currentSellerId: number | null;
}

const isOpen = (o: Opportunity) => o.stage !== 'FECHAMENTO' && o.stage !== 'PERDIDA';
const hasFlag = (o: Opportunity, ...codes: string[]) => o.attention.flags.some((f) => codes.includes(f.code));

export const QUICK_FILTERS: Record<QuickFilterId, { label: string; test: (o: Opportunity, ctx: FilterContext) => boolean }> = {
  attention: { label: 'Exigem atenção', test: (o) => o.attention.level !== 'OK' },
  overdue: { label: 'Retorno atrasado', test: (o) => (o.attention.nextFollowUp?.daysLate ?? 0) > 0 },
  today: { label: 'Retorno hoje', test: (o, ctx) => isOpen(o) && o.attention.nextFollowUp?.dueDate === ctx.today },
  mine: { label: 'Minhas', test: (o, ctx) => o.seller.id === ctx.currentSellerId },
  critical: { label: 'Críticas', test: (o) => o.attention.level === 'CRITICAL' },
  proposal: { label: 'Proposta vencendo', test: (o) => hasFlag(o, 'PROPOSAL_EXPIRED', 'PROPOSAL_EXPIRING') },
  event: { label: 'Evento próximo', test: (o) => hasFlag(o, 'EVENT_SOON', 'EVENT_PASSED') },
};

export interface BoardFilters {
  search: string;
  sellerId: number | null;
  quick: QuickFilterId[];
}

export const EMPTY_BOARD_FILTERS: BoardFilters = { search: '', sellerId: null, quick: [] };

export function applyFilters(list: Opportunity[], filters: BoardFilters, ctx: FilterContext): Opportunity[] {
  return list.filter(
    (o) =>
      (filters.sellerId === null || o.seller.id === filters.sellerId) &&
      matchesSearch(o, filters.search) &&
      filters.quick.every((id) => QUICK_FILTERS[id].test(o, ctx)),
  );
}

export function hasActiveFilters(filters: BoardFilters): boolean {
  return filters.search.trim() !== '' || filters.sellerId !== null || filters.quick.length > 0;
}

// Fica em memória (não em localStorage) para a busca global conseguir aplicar um filtro e abrir o funil.
let state = EMPTY_BOARD_FILTERS;
const listeners = new Set<() => void>();

export function setBoardFilters(update: BoardFilters | ((prev: BoardFilters) => BoardFilters)) {
  state = typeof update === 'function' ? update(state) : update;
  listeners.forEach((listener) => listener());
}

export function toggleQuickFilter(id: QuickFilterId) {
  setBoardFilters((f) => ({ ...f, quick: f.quick.includes(id) ? f.quick.filter((q) => q !== id) : [...f.quick, id] }));
}

export function useBoardFilters(): BoardFilters {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => state,
    () => EMPTY_BOARD_FILTERS,
  );
}
