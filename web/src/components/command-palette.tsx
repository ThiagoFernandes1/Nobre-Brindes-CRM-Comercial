'use client';

import {
  Building2,
  CalendarClock,
  Clock,
  Columns3,
  CornerDownLeft,
  Keyboard,
  Plus,
  Search,
  SearchX,
  TriangleAlert,
  UserCheck,
  type LucideIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { EMPTY_BOARD_FILTERS, setBoardFilters, type QuickFilterId } from '@/lib/board-filters';
import { formatCurrency } from '@/lib/format';
import { useAllOpportunities, useMeta } from '@/lib/queries';
import { fold, matchesSearch } from '@/lib/search';
import { stageLabel } from '@/lib/stage-moves';
import { useCurrentSeller } from './providers';
import { useUi } from './ui-provider';
import { Highlight } from './ui/highlight';
import { Kbd, SeverityBadge } from './ui/primitives';

interface PaletteItem {
  id: string;
  group: string;
  icon: LucideIcon;
  label: string;
  query?: string;
  detail?: string;
  trailing?: ReactNode;
  hint?: string;
  run: () => void;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      aria-label="Busca global"
      className="mx-auto mt-[12vh] w-[calc(100%-2rem)] max-w-xl rounded-2xl bg-white p-0 text-stone-900 shadow-2xl ring-1 ring-stone-200 backdrop:bg-stone-900/50 backdrop:backdrop-blur-[2px]"
    >
      {open && <PaletteBody onClose={onClose} />}
    </dialog>
  );
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const router = useRouter();
  const meta = useMeta();
  const opportunities = useAllOpportunities();
  const { sellerId } = useCurrentSeller();
  const { openOpportunity, openNewOpportunity, openShortcuts } = useUi();

  const items = useMemo<PaletteItem[]>(() => {
    const q = query.trim();
    const showOnBoard = (quick: QuickFilterId[]) => {
      setBoardFilters({ ...EMPTY_BOARD_FILTERS, quick });
      router.push('/');
    };

    const list = opportunities.data ?? [];
    const found = q ? list.filter((o) => matchesSearch(o, q)).slice(0, 8) : list.filter((o) => o.attention.level !== 'OK').slice(0, 5);
    const opportunityItems: PaletteItem[] = found.map((o) => ({
      id: `opp-${o.id}`,
      group: q ? 'Oportunidades' : 'Pedem atenção agora',
      icon: Building2,
      label: o.companyName,
      query: q,
      detail: `${o.code} · ${stageLabel(meta.data, o.stage)} · ${o.seller.name}`,
      trailing: o.attention.flags[0] ? (
        <SeverityBadge severity={o.attention.flags[0].severity}>{o.attention.flags[0].message}</SeverityBadge>
      ) : (
        <span className="text-xs text-stone-500">{formatCurrency(o.estimatedValue)}</span>
      ),
      run: () => openOpportunity(o.id),
    }));

    const actions: PaletteItem[] = [
      { id: 'new', group: 'Ações', icon: Plus, label: 'Nova oportunidade', hint: 'N', run: openNewOpportunity },
      { id: 'attention', group: 'Ações', icon: TriangleAlert, label: 'Mostrar o que exige atenção', run: () => showOnBoard(['attention']) },
      { id: 'overdue', group: 'Ações', icon: Clock, label: 'Mostrar retornos atrasados', run: () => showOnBoard(['overdue']) },
      ...(sellerId
        ? [{ id: 'mine', group: 'Ações', icon: UserCheck, label: 'Mostrar minhas oportunidades', run: () => showOnBoard(['mine']) }]
        : []),
      { id: 'funil', group: 'Ir para', icon: Columns3, label: 'Funil', run: () => router.push('/') },
      { id: 'retornos', group: 'Ir para', icon: CalendarClock, label: 'Retornos', run: () => router.push('/retornos') },
      { id: 'shortcuts', group: 'Ajuda', icon: Keyboard, label: 'Atalhos do teclado', hint: '?', run: openShortcuts },
    ];
    const terms = fold(q).split(/\s+/).filter(Boolean);
    const matchingActions = actions.filter((a) => terms.every((t) => fold(`${a.group} ${a.label}`).includes(t)));

    return [...opportunityItems, ...matchingActions];
  }, [query, opportunities.data, meta.data, sellerId, router, openOpportunity, openNewOpportunity, openShortcuts]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function select(item: PaletteItem | undefined) {
    if (!item) return;
    onClose();
    item.run();
  }

  const groups: { name: string; items: { item: PaletteItem; index: number }[] }[] = [];
  items.forEach((item, index) => {
    let group = groups.find((g) => g.name === item.group);
    if (!group) {
      group = { name: item.group, items: [] };
      groups.push(group);
    }
    group.items.push({ item, index });
  });

  return (
    <div>
      <div className="flex items-center gap-3 border-b border-stone-200 px-4">
        <Search className="size-5 shrink-0 text-stone-400" aria-hidden />
        <input
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActive((i) => Math.min(i + 1, items.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (event.key === 'Enter') {
              event.preventDefault();
              select(items[active]);
            }
          }}
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-results"
          aria-activedescendant={items[active] ? `palette-${items[active].id}` : undefined}
          placeholder="Busque empresa, código, brinde, vendedor… ou uma ação"
          className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-stone-400"
        />
        <Kbd>Esc</Kbd>
      </div>

      <ul id="palette-results" ref={listRef} role="listbox" aria-label="Resultados" className="max-h-[55vh] overflow-y-auto p-2">
        {opportunities.isPending && <li className="px-3 py-6 text-center text-sm text-stone-500">Carregando oportunidades…</li>}
        {items.length === 0 && (
          <li className="flex flex-col items-center gap-2 px-3 py-8 text-center text-sm text-stone-500">
            <SearchX className="size-6 text-stone-400" aria-hidden />
            Nada encontrado para “{query}”.
          </li>
        )}
        {groups.map((group) => (
          <li key={group.name} role="presentation">
            <p className="px-3 pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-stone-500">{group.name}</p>
            <ul role="presentation">
              {group.items.map(({ item, index }) => {
                const Icon = item.icon;
                const isActive = index === active;
                return (
                  <li
                    key={item.id}
                    id={`palette-${item.id}`}
                    data-index={index}
                    role="option"
                    aria-selected={isActive}
                    onMouseMove={() => setActive(index)}
                    onClick={() => select(item)}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 ${isActive ? 'bg-brand-50 ring-1 ring-brand-200' : ''}`}
                  >
                    <Icon className={`size-4 shrink-0 ${isActive ? 'text-brand-700' : 'text-stone-400'}`} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        <Highlight text={item.label} query={item.query ?? query} />
                      </p>
                      {item.detail && (
                        <p className="truncate text-xs text-stone-500">
                          <Highlight text={item.detail} query={item.query ?? ''} />
                        </p>
                      )}
                    </div>
                    {item.trailing}
                    {item.hint && <Kbd>{item.hint}</Kbd>}
                    {isActive && <CornerDownLeft className="size-4 text-brand-700" aria-hidden />}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-stone-200 px-4 py-2 text-xs text-stone-500">
        <span className="flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> navegar
        </span>
        <span className="flex items-center gap-1">
          <Kbd>Enter</Kbd> abrir
        </span>
        <span className="ml-auto">Busca sem acento: “clinica” acha “Clínica”</span>
      </footer>
    </div>
  );
}
