'use client';

import { useState } from 'react';
import { formatDate } from '@/lib/format';
import { useRegisterContact } from '@/lib/queries';
import type { ContactChannel } from '@/lib/types';
import { ApiErrorMessage, Button, Field, inputClass } from '../ui/primitives';
import { useToast } from '../ui/toast';

export const CHANNEL_LABELS: Record<ContactChannel, string> = {
  PHONE: 'Telefone',
  WHATSAPP: 'WhatsApp',
  EMAIL: 'E-mail',
  MEETING: 'Reunião',
};

export function ContactForm({
  opportunityId,
  today,
  onDone,
}: {
  opportunityId: number;
  today: string;
  onDone: () => void;
}) {
  const [channel, setChannel] = useState<ContactChannel>('PHONE');
  const [summary, setSummary] = useState('');
  const [nextFollowUpAt, setNextFollowUpAt] = useState('');
  const register = useRegisterContact(opportunityId);
  const toast = useToast();

  return (
    <form
      className="space-y-3 rounded-lg border border-brand-100 bg-brand-50/50 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        register.mutate(
          { channel, summary: summary.trim(), nextFollowUpAt: nextFollowUpAt || null },
          {
            onSuccess: (updated) => {
              const next = updated.attention.nextFollowUp;
              toast({
                tone: 'success',
                title: 'Contato registrado',
                description: next ? `Próximo retorno agendado para ${formatDate(next.dueDate)}.` : undefined,
              });
              onDone();
            },
          },
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Canal">
          <select value={channel} onChange={(e) => setChannel(e.target.value as ContactChannel)} className={inputClass}>
            {Object.entries(CHANNEL_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Cliente pediu retorno em" hint="Opcional. Sem data, vale a cadência da etapa.">
          <input
            type="date"
            min={today}
            value={nextFollowUpAt}
            onChange={(e) => setNextFollowUpAt(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="O que foi conversado">
        <textarea
          required
          minLength={3}
          rows={3}
          autoFocus
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Ex.: cliente vai aprovar com a diretoria na sexta; pediu amostra da caneca."
          className={inputClass}
        />
      </Field>
      <ApiErrorMessage error={register.error} />
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancelar</Button>
        <Button type="submit" variant="primary" disabled={register.isPending || summary.trim().length < 3}>
          {register.isPending ? 'Salvando…' : 'Registrar contato'}
        </Button>
      </div>
    </form>
  );
}
