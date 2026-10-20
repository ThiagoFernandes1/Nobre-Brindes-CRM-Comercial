import type { Opportunity } from './types';

// minúsculo e sem acento, caractere por caractere (mantém os índices iguais ao texto original)
function foldChar(char: string): string {
  return char.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function fold(text: string): string {
  return [...text].map(foldChar).join('');
}

function searchableText(o: Opportunity): string {
  return [o.code, o.companyName, o.seller.name, o.notes ?? '', ...o.items.map((i) => i.description)].join(' ');
}

/** Todas as palavras digitadas precisam aparecer (em qualquer campo, em qualquer ordem). */
export function matchesSearch(o: Opportunity, query: string): boolean {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = fold(searchableText(o));
  return terms.every((term) => haystack.includes(term));
}

/** Trechos de `text` que casam com algum termo da busca, para destacar. */
export function highlightRanges(text: string, query: string): [number, number][] {
  const chars = [...text];
  const folded = chars.map(foldChar);
  // algum caractere virou mais de um ao normalizar: sem destaque para não errar a posição
  if (folded.some((c) => c.length !== 1)) return [];
  const haystack = folded.join('');
  const ranges: [number, number][] = [];
  for (const term of fold(query).split(/\s+/).filter(Boolean)) {
    let from = 0;
    let index: number;
    while ((index = haystack.indexOf(term, from)) !== -1) {
      ranges.push([index, index + term.length]);
      from = index + term.length;
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  return merged;
}
