'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type Tone = 'success' | 'error';

interface Toast {
  id: number;
  tone: Tone;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

const ToastContext = createContext<(toast: Omit<Toast, 'id'>) => void>(() => {});

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = nextId++;
      setToasts((list) => [...list.slice(-2), { ...toast, id }]);
      // erro fica mais tempo na tela
      setTimeout(() => dismiss(id), toast.tone === 'error' ? 8000 : 3500);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-lg border px-4 py-3 shadow-lg ${
              toast.tone === 'error' ? 'border-red-200 bg-red-50 text-red-900' : 'border-brand-200 bg-white text-stone-900'
            }`}
          >
            <span aria-hidden className="mt-0.5">{toast.tone === 'error' ? '⛔' : '✅'}</span>
            <div className="flex-1 text-sm">
              <p className="font-semibold">{toast.title}</p>
              {toast.description && <p className="mt-0.5">{toast.description}</p>}
              {toast.action && (
                <button
                  type="button"
                  className="mt-1 font-semibold underline underline-offset-2"
                  onClick={() => {
                    toast.action!.onClick();
                    dismiss(toast.id);
                  }}
                >
                  {toast.action.label}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="text-stone-500 hover:text-stone-800"
              aria-label="Fechar aviso"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
