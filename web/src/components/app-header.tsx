'use client';

import { CalendarClock, Columns3, Keyboard, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { formatDate } from '@/lib/format';
import { useAgenda, useMeta, useSellers } from '@/lib/queries';
import { useCurrentSeller } from './providers';
import { useUi } from './ui-provider';

export function AppHeader() {
  const pathname = usePathname();
  const meta = useMeta();
  const sellers = useSellers();
  const { sellerId, setSellerId } = useCurrentSeller();
  const { openPalette, openShortcuts } = useUi();
  const agenda = useAgenda(sellerId);
  const pending = agenda.data?.filter((t) => t.bucket !== 'UPCOMING').length ?? 0;

  const nav = [
    { href: '/', label: 'Funil', icon: Columns3, badge: 0 },
    { href: '/retornos', label: 'Retornos', icon: CalendarClock, badge: pending },
  ];

  return (
    <header className="sticky top-0 z-30 bg-brand-900 text-white shadow-sm">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5 sm:px-6">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-lg font-semibold tracking-tight">Nobre Brindes</span>
          <span className="hidden text-sm text-white/60 sm:inline">CRM Comercial</span>
        </Link>

        <nav aria-label="Principal" className="flex gap-1">
          {nav.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
                  active ? 'bg-white/15 text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className="size-4" aria-hidden />
                {item.label}
                {item.badge > 0 && (
                  <span
                    className="rounded-full bg-red-500 px-1.5 text-xs font-semibold tabular-nums text-white"
                    aria-label={`${item.badge} retornos pendentes hoje`}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={openPalette}
          className="order-last flex w-full items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white/70 ring-1 ring-white/15 transition hover:bg-white/15 hover:text-white md:order-none md:w-auto md:min-w-72 md:flex-1 md:max-w-md"
        >
          <Search className="size-4" aria-hidden />
          <span className="flex-1 text-left">Buscar oportunidade ou ação…</span>
          <kbd className="rounded border border-white/25 px-1.5 font-sans text-[11px] text-white/70">Ctrl K</kbd>
        </button>

        <div className="ml-auto flex items-center gap-3 text-sm">
          {meta.data && (
            <span
              className="hidden rounded-md bg-white/10 px-2 py-1 text-xs text-white/85 sm:inline"
              title="Data usada nas regras de atenção e follow-up (REFERENCE_DATE na API)"
            >
              Hoje: {formatDate(meta.data.today)}
            </span>
          )}
          <label className="flex items-center gap-2">
            <span className="text-white/70">Você é</span>
            <select
              value={sellerId ?? ''}
              onChange={(e) => setSellerId(e.target.value ? Number(e.target.value) : null)}
              className="rounded-md border border-white/20 bg-brand-800 px-2 py-1 text-sm text-white"
            >
              <option value="">—</option>
              {sellers.data?.map((seller) => (
                <option key={seller.id} value={seller.id}>
                  {seller.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={openShortcuts}
            className="hidden rounded-md p-1.5 text-white/70 hover:bg-white/10 hover:text-white sm:block"
            aria-label="Atalhos do teclado"
            title="Atalhos do teclado (?)"
          >
            <Keyboard className="size-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
