'use client';

import { useEffect, useRef, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  /** 'center' para diálogos curtos, 'side' para o painel de detalhes. */
  variant?: 'center' | 'side';
}

export function Modal({ open, onClose, title, children, variant = 'center' }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const layout =
    variant === 'side'
      ? 'ml-auto mr-0 h-dvh max-h-dvh w-full max-w-2xl rounded-none sm:rounded-l-xl'
      : 'm-auto w-[calc(100%-2rem)] max-w-lg rounded-xl';

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose(); // clique no fundo escuro
      }}
      className={`${layout} bg-white p-0 text-stone-900 shadow-2xl backdrop:bg-stone-900/40`}
    >
      {open && (
        <div className="flex h-full max-h-[inherit] flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-4">
            <div className="min-w-0 flex-1">{typeof title === 'string' ? <h2 className="text-lg font-semibold">{title}</h2> : title}</div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-stone-500 hover:bg-stone-100 hover:text-stone-900"
              aria-label="Fechar"
            >
              ✕
            </button>
          </header>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        </div>
      )}
    </dialog>
  );
}
