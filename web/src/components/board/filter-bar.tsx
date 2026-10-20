'use client';

import { Columns3, List, Plus, Search, X } from 'lucide-react';
import {
  EMPTY_BOARD_FILTERS,
  hasActiveFilters,
  QUICK_FILTERS,
  setBoardFilters,
  toggleQuickFilter,
  type BoardFilters,
  type QuickFilterId,
} from '@/lib/board-filters';
import { writePreference } from '@/lib/preferences';
import { useSellers } from '@/lib/queries';
import type { Opportunity } from '@/lib/types';
import { useUi } from '../ui-provider';
import { Button, inputClass, Kbd } from '../ui/primitives';

export type BoardView = 'kanban' | 'list';
export const VIEW_PREFERENCE = 'nobre-crm:board-view';

// os outros filtros rápidos ficam nos cartões do resumo
const CHIPS: QuickFilterId[] = ['mine', 'critical', 'proposal', 'event'];

interface FilterBarProps {
  filters: BoardFilters;
  view: BoardView;
  /** já filtrada por busca e vendedor: base das contagens */
  scoped: Opportunity[];
  visibleCount: number;
  totalCount: number;
  today: string;
  currentSellerId: number | null;
}

export function FilterBar({ filters, view, scoped, visibleCount, totalCount, today, currentSellerId }: FilterBarProps) {
  const sellers = useSellers();
  const { openNewOpportunity } = useUi();
  const active = hasActiveFilters(filters);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 basis-64">
          <span className="sr-only">Pesquisar no funil</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" aria-hidden />
          <input
            id="board-search"
            type="text"
            value={filters.search}
            onChange={(e) => setBoardFilters((f) => ({ ...f, search: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setBoardFilters((f) => ({ ...f, search: '' }));
                e.currentTarget.blur();
              }
            }}
            placeholder="Empresa, código, brinde, vendedor ou anotação"
            className={`${inputClass} pl-9 pr-10`}
            autoComplete="off"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2">
            {filters.search ? (
              <button
                type="button"
                onClick={() => setBoardFilters((f) => ({ ...f, search: '' }))}
                className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                aria-label="Limpar busca"
              >
                <X className="size-4" />
              </button>
            ) : (
              <Kbd>/</Kbd>
            )}
          </span>
        </label>

        <label className="w-full sm:w-44">
          <span className="sr-only">Filtrar por vendedor</span>
          <select
            value={filters.sellerId ?? ''}
            onChange={(e) => setBoardFilters((f) => ({ ...f, sellerId: e.target.value ? Number(e.target.value) : null }))}
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

        <div role="group" aria-label="Visualização" className="flex rounded-lg border border-stone-300 bg-white p-0.5">
          {(
            [
              ['kanban', 'Kanban', Columns3],
              ['list', 'Lista', List],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              aria-pressed={view === id}
              onClick={() => writePreference(VIEW_PREFERENCE, id)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                view === id ? 'bg-brand-700 text-white' : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </button>
          ))}
        </div>

        <Button variant="primary" onClick={openNewOpportunity} className="ml-auto">
          <Plus className="size-4" aria-hidden />
          Nova oportunidade
          <span className="hidden rounded bg-white/20 px-1 text-[11px] sm:inline">N</span>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-stone-500">Filtros rápidos:</span>
        {CHIPS.map((id) => {
          const isActive = filters.quick.includes(id);
          const disabled = id === 'mine' && currentSellerId === null;
          const count = disabled ? 0 : scoped.filter((o) => QUICK_FILTERS[id].test(o, { today, currentSellerId })).length;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={isActive}
              disabled={disabled}
              title={disabled ? 'Escolha quem é você no topo da tela' : undefined}
              onClick={() => toggleQuickFilter(id)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                isActive
                  ? 'border-brand-700 bg-brand-700 text-white'
                  : 'border-stone-300 bg-white text-stone-700 hover:border-stone-400 hover:bg-stone-50'
              }`}
            >
              {QUICK_FILTERS[id].label}
              <span
                className={`rounded-full px-1.5 text-xs tabular-nums ${isActive ? 'bg-white/20' : 'bg-stone-100 text-stone-600'}`}
              >
                {count}
              </span>
            </button>
          );
        })}

        <span className="ml-auto text-sm text-stone-500" aria-live="polite">
          {active ? `Mostrando ${visibleCount} de ${totalCount}` : `${totalCount} oportunidades`}
        </span>
        {active && (
          <Button variant="ghost" onClick={() => setBoardFilters(EMPTY_BOARD_FILTERS)} className="py-1">
            <X className="size-4" aria-hidden />
            Limpar filtros
          </Button>
        )}
      </div>
    </div>
  );
}
