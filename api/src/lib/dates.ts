/** Data de calendário no formato YYYY-MM-DD. Datas de negócio (contato, validade, evento) não têm hora. */
export type IsoDate = string;

const DAY_MS = 86_400_000;

function toUtcMs(date: IsoDate): number {
  return Date.parse(`${date}T00:00:00Z`);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return new Date(toUtcMs(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Dias corridos de `from` até `to` (negativo se `to` for anterior). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

export function todayIn(timeZone: string, now = new Date()): IsoDate {
  // en-CA formata como YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
}

export function formatBr(date: IsoDate): string {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
