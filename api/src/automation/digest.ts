import { formatBr, plural, type IsoDate } from '../lib/dates.js';
import type { AgendaEntry } from '../services/follow-ups.js';

export interface DigestLine {
  opportunityId: number;
  code: string;
  companyName: string;
  title: string;
  dueDate: IsoDate;
  daysLate: number;
}

export interface SellerDigest {
  sellerId: number;
  sellerName: string;
  date: IsoDate;
  overdue: DigestLine[];
  dueToday: DigestLine[];
}

/** Agrupa por vendedor o que vence hoje ou já venceu. Vendedor sem pendência não recebe resumo. */
export function buildSellerDigests(agenda: AgendaEntry[], today: IsoDate): SellerDigest[] {
  const bySeller = new Map<number, SellerDigest>();
  for (const entry of agenda) {
    if (entry.bucket === 'UPCOMING') continue;
    const seller = entry.opportunity.seller;
    let digest = bySeller.get(seller.id);
    if (!digest) {
      digest = { sellerId: seller.id, sellerName: seller.name, date: today, overdue: [], dueToday: [] };
      bySeller.set(seller.id, digest);
    }
    const line: DigestLine = {
      opportunityId: entry.opportunity.id,
      code: entry.opportunity.code,
      companyName: entry.opportunity.companyName,
      title: entry.title,
      dueDate: entry.dueDate,
      daysLate: entry.daysLate,
    };
    (entry.bucket === 'OVERDUE' ? digest.overdue : digest.dueToday).push(line);
  }
  for (const digest of bySeller.values()) {
    digest.overdue.sort((a, b) => b.daysLate - a.daysLate);
  }
  return [...bySeller.values()].sort((a, b) => a.sellerName.localeCompare(b.sellerName));
}

export function formatDigestText(digest: SellerDigest): string {
  const lines = [
    `Bom dia, ${digest.sellerName}! Seus retornos de ${formatBr(digest.date)}:`,
  ];
  if (digest.overdue.length) {
    lines.push('', `ATRASADOS (${digest.overdue.length})`);
    for (const l of digest.overdue) {
      lines.push(`• ${l.code} ${l.companyName}: ${l.title} (atrasado há ${plural(l.daysLate, 'dia')})`);
    }
  }
  if (digest.dueToday.length) {
    lines.push('', `PARA HOJE (${digest.dueToday.length})`);
    for (const l of digest.dueToday) lines.push(`• ${l.code} ${l.companyName}: ${l.title}`);
  }
  return lines.join('\n');
}
