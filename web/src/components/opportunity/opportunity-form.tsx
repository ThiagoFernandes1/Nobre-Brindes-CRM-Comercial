'use client';

import { useState, type FormEvent } from 'react';
import type { OpportunityInput } from '@/lib/api';
import { useSellers } from '@/lib/queries';
import type { Opportunity } from '@/lib/types';
import { ApiErrorMessage, Button, Field, inputClass } from '../ui/primitives';

interface ItemDraft {
  key: number;
  description: string;
  quantity: string;
}

interface OpportunityFormProps {
  initial?: Opportunity;
  defaultSellerId?: number | null;
  submitLabel: string;
  isSubmitting: boolean;
  error: unknown;
  onSubmit: (input: OpportunityInput) => void;
  onCancel: () => void;
}

let itemKey = 0;

export function OpportunityForm({ initial, defaultSellerId, submitLabel, isSubmitting, error, onSubmit, onCancel }: OpportunityFormProps) {
  const sellers = useSellers();
  const [companyName, setCompanyName] = useState(initial?.companyName ?? '');
  const [sellerId, setSellerId] = useState<string>(String(initial?.seller.id ?? defaultSellerId ?? ''));
  const [estimatedValue, setEstimatedValue] = useState(initial?.estimatedValue?.toString() ?? '');
  const [proposalValidUntil, setProposalValidUntil] = useState(initial?.proposalValidUntil ?? '');
  const [eventDate, setEventDate] = useState(initial?.eventDate ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [items, setItems] = useState<ItemDraft[]>(
    initial?.items.map((item) => ({ key: itemKey++, description: item.description, quantity: String(item.quantity) })) ?? [],
  );

  function updateItem(key: number, patch: Partial<ItemDraft>) {
    setItems((list) => list.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit({
      companyName: companyName.trim(),
      sellerId: Number(sellerId),
      estimatedValue: estimatedValue === '' ? null : Number(estimatedValue),
      proposalValidUntil: proposalValidUntil || null,
      eventDate: eventDate || null,
      notes: notes.trim() || null,
      items: items
        .filter((item) => item.description.trim() !== '')
        .map((item) => ({ description: item.description.trim(), quantity: Number(item.quantity) || 0 })),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Empresa">
          <input required value={companyName} onChange={(e) => setCompanyName(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Vendedor">
          <select required value={sellerId} onChange={(e) => setSellerId(e.target.value)} className={inputClass}>
            <option value="" disabled>
              Selecione
            </option>
            {sellers.data?.map((seller) => (
              <option key={seller.id} value={seller.id}>
                {seller.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Valor estimado (R$)" hint="Obrigatório a partir de Apresentação de Orçamento.">
          <input
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            value={estimatedValue}
            onChange={(e) => setEstimatedValue(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Validade da proposta" hint="Obrigatória a partir de Follow-up.">
          <input type="date" value={proposalValidUntil} onChange={(e) => setProposalValidUntil(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Data do evento do cliente" hint="Usada para avisar do prazo de produção.">
          <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className={inputClass} />
        </Field>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-stone-800">Itens de brinde</legend>
        <p className="text-xs text-stone-500">Pelo menos um item é obrigatório a partir de Apresentação de Orçamento.</p>
        <ul className="mt-2 space-y-2">
          {items.map((item, index) => (
            <li key={item.key} className="flex gap-2">
              <input
                aria-label={`Descrição do item ${index + 1}`}
                placeholder="Ex.: Caneca personalizada"
                value={item.description}
                onChange={(e) => updateItem(item.key, { description: e.target.value })}
                className={inputClass}
              />
              <input
                aria-label={`Quantidade do item ${index + 1}`}
                type="number"
                min="1"
                step="1"
                placeholder="Qtd."
                value={item.quantity}
                onChange={(e) => updateItem(item.key, { quantity: e.target.value })}
                className={`${inputClass} w-24`}
              />
              <Button
                variant="ghost"
                aria-label={`Remover item ${index + 1}`}
                onClick={() => setItems((list) => list.filter((i) => i.key !== item.key))}
              >
                ✕
              </Button>
            </li>
          ))}
        </ul>
        <Button
          className="mt-2"
          onClick={() => setItems((list) => [...list, { key: itemKey++, description: '', quantity: '' }])}
        >
          + Adicionar item
        </Button>
      </fieldset>

      <Field label="Observações">
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
      </Field>

      <ApiErrorMessage error={error} />

      <div className="flex justify-end gap-2">
        <Button onClick={onCancel}>Cancelar</Button>
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting ? 'Salvando…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
