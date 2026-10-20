import type { Metadata } from 'next';
import { Agenda } from '@/components/agenda/agenda';

export const metadata: Metadata = { title: 'Retornos · CRM Nobre Brindes' };

export default function FollowUpsPage() {
  return <Agenda />;
}
