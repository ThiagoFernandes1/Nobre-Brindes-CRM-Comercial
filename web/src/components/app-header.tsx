'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { formatDate } from '@/lib/format';
import { useMeta, useSellers } from '@/lib/queries';
import { useCurrentSeller } from './providers';

const NAV = [
  { href: '/', label: 'Funil' },
  { href: '/retornos', label: 'Retornos' },
];

export function AppHeader() {
  const pathname = usePathname();
  const meta = useMeta();
  const sellers = useSellers();
  const { sellerId, setSellerId } = useCurrentSeller();

  return (
    <header className="bg-brand-900 text-white">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-lg font-semibold tracking-tight">Nobre Brindes</span>
          <span className="text-sm text-white/70">CRM Comercial</span>
        </Link>

        <nav aria-label="Principal" className="flex gap-1">
          {NAV.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${active ? 'bg-white/15 text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-4 text-sm">
          {meta.data && (
            <span
              className="rounded-md bg-white/10 px-2 py-1 text-xs text-white/85"
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
        </div>
      </div>
    </header>
  );
}
