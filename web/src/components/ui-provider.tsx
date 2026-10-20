'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CommandPalette } from './command-palette';
import { NewOpportunityModal } from './opportunity/new-opportunity';
import { OpportunityDrawer } from './opportunity/opportunity-drawer';
import { Modal } from './ui/modal';
import { Kbd } from './ui/primitives';

export type DrawerMode = 'view' | 'contact' | 'edit';

interface UiContextValue {
  openOpportunity: (id: number, mode?: DrawerMode) => void;
  openNewOpportunity: () => void;
  openPalette: () => void;
  openShortcuts: () => void;
}

const UiContext = createContext<UiContextValue | null>(null);

export function useUi(): UiContextValue {
  const value = useContext(UiContext);
  if (!value) throw new Error('useUi precisa estar dentro de UiProvider');
  return value;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export const SHORTCUTS: { keys: string[]; description: string }[] = [
  { keys: ['Ctrl', 'K'], description: 'Busca global: oportunidades e ações' },
  { keys: ['/'], description: 'Pesquisar no funil' },
  { keys: ['N'], description: 'Nova oportunidade' },
  { keys: ['?'], description: 'Mostrar os atalhos' },
  { keys: ['Esc'], description: 'Fechar janela ou painel' },
];

export function UiProvider({ children }: { children: ReactNode }) {
  const [drawer, setDrawer] = useState<{ id: number; mode: DrawerMode } | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const openOpportunity = useCallback((id: number, mode: DrawerMode = 'view') => setDrawer({ id, mode }), []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
      if (document.querySelector('dialog[open]')) return;

      if (event.key === '/') {
        event.preventDefault();
        const search = document.getElementById('board-search');
        if (search) search.focus();
        else setPaletteOpen(true);
      } else if (event.key === 'n' || event.key === 'N') {
        event.preventDefault();
        setNewOpen(true);
      } else if (event.key === '?') {
        setShortcutsOpen(true);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const value = useMemo<UiContextValue>(
    () => ({
      openOpportunity,
      openNewOpportunity: () => setNewOpen(true),
      openPalette: () => setPaletteOpen(true),
      openShortcuts: () => setShortcutsOpen(true),
    }),
    [openOpportunity],
  );

  return (
    <UiContext.Provider value={value}>
      {children}
      <OpportunityDrawer
        opportunityId={drawer?.id ?? null}
        initialMode={drawer?.mode ?? 'view'}
        onClose={() => setDrawer(null)}
      />
      <NewOpportunityModal open={newOpen} onClose={() => setNewOpen(false)} onCreated={openOpportunity} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <Modal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} title="Atalhos do teclado">
        <ul className="divide-y divide-stone-100">
          {SHORTCUTS.map((shortcut) => (
            <li key={shortcut.description} className="flex items-center justify-between py-2.5 text-sm">
              <span>{shortcut.description}</span>
              <span className="flex gap-1">
                {shortcut.keys.map((key) => (
                  <Kbd key={key}>{key}</Kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </Modal>
    </UiContext.Provider>
  );
}
