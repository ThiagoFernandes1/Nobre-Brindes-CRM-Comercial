'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { ApiError, setActorName } from '@/lib/api';
import { useSellers } from '@/lib/queries';
import { ToastProvider } from './ui/toast';

let browserQueryClient: QueryClient | undefined;

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        // Erro de regra (4xx) não melhora tentando de novo; só falha de rede/servidor.
        retry: (failureCount, error) =>
          failureCount < 2 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
      },
    },
  });
}

function getQueryClient() {
  if (typeof window === 'undefined') return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

interface CurrentSellerContextValue {
  sellerId: number | null;
  setSellerId: (id: number | null) => void;
}

const CurrentSellerContext = createContext<CurrentSellerContextValue>({ sellerId: null, setSellerId: () => {} });
const STORAGE_KEY = 'nobre-crm:current-seller';
const storageListeners = new Set<() => void>();

function subscribeToStoredSeller(listener: () => void) {
  storageListeners.add(listener);
  window.addEventListener('storage', listener); // outras abas
  return () => {
    storageListeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function readStoredSeller(): number | null {
  try {
    const stored = Number(window.localStorage.getItem(STORAGE_KEY));
    return stored > 0 ? stored : null;
  } catch {
    return null; // armazenamento indisponível (ex.: modo privado): segue sem lembrar
  }
}

function storeSeller(id: number | null) {
  try {
    if (id) window.localStorage.setItem(STORAGE_KEY, String(id));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // idem: a escolha só não fica lembrada
  }
  storageListeners.forEach((listener) => listener());
}

/** "Quem é você": lembrado no navegador, usado na agenda e como autor das mudanças no histórico. */
function CurrentSellerProvider({ children }: { children: ReactNode }) {
  // No servidor não há localStorage: começa sem vendedor e o navegador assume após hidratar.
  const sellerId = useSyncExternalStore(subscribeToStoredSeller, readStoredSeller, () => null);
  const { data: sellers } = useSellers();

  useEffect(() => {
    setActorName(sellers?.find((s) => s.id === sellerId)?.name ?? null);
  }, [sellers, sellerId]);

  return (
    <CurrentSellerContext.Provider value={{ sellerId, setSellerId: storeSeller }}>{children}</CurrentSellerContext.Provider>
  );
}

export function useCurrentSeller() {
  return useContext(CurrentSellerContext);
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      <ToastProvider>
        <CurrentSellerProvider>{children}</CurrentSellerProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
