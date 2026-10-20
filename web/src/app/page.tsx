import type { Metadata } from 'next';
import { Board } from '@/components/board/board';

export const metadata: Metadata = { title: 'Funil · CRM Nobre Brindes' };

export default function FunnelPage() {
  return (
    <>
      <h1 className="sr-only">Funil de vendas</h1>
      <Board />
    </>
  );
}
