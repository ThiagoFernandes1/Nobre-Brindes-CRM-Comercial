'use client';

import { useSyncExternalStore } from 'react';

// preferências de tela guardadas no navegador (visão escolhida, colunas recolhidas)
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePreference(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignora
  }
  listeners.forEach((listener) => listener());
}

/** Devolve a string guardada (ou o padrão). Strings são estáveis entre leituras, o que o React exige aqui. */
export function usePreference(key: string, fallback: string): string {
  return useSyncExternalStore(subscribe, () => read(key) ?? fallback, () => fallback);
}
