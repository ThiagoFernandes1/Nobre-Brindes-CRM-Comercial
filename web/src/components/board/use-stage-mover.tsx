'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/api';
import { useChangeStage } from '@/lib/queries';
import { classifyMove, stageLabel } from '@/lib/stage-moves';
import type { Meta, Opportunity, Stage } from '@/lib/types';
import { Modal } from '../ui/modal';
import { ApiErrorMessage, Button, Field, inputClass } from '../ui/primitives';
import { useToast } from '../ui/toast';

interface PendingMove {
  opportunity: Opportunity;
  to: Stage;
  kind: 'LOSS' | 'RETURN';
}

const LOSS_SUGGESTIONS = ['Preço acima do orçamento do cliente', 'Fechou com concorrente', 'Prazo de entrega não atende o evento', 'Cliente cancelou o evento', 'Sem resposta do cliente'];

/**
 * Fluxo único de mudança de etapa, usado pelo arrastar do Kanban e pelos botões do detalhe.
 * `onOpenOpportunity` permite oferecer "completar dados" quando a API recusa por falta de informação.
 */
export function useStageMover(meta: Meta | undefined, onOpenOpportunity?: (id: number) => void) {
  const [pending, setPending] = useState<PendingMove | null>(null);
  const changeStage = useChangeStage();
  const toast = useToast();

  async function run(opportunity: Opportunity, to: Stage, options: { reason?: string; optimistic?: boolean } = {}) {
    await changeStage.mutateAsync({ id: opportunity.id, from: opportunity.stage, to, ...options });
    toast({ tone: 'success', title: `${opportunity.code} movida para ${stageLabel(meta, to)}` });
  }

  function requestMove(opportunity: Opportunity, to: Stage) {
    if (!meta || opportunity.stage === to) return;
    const kind = classifyMove(meta, opportunity.stage, to);
    if (kind === 'LOSS' || kind === 'RETURN') {
      changeStage.reset();
      setPending({ opportunity, to, kind });
      return;
    }
    // Movimentos que sabemos inválidos vão à API sem mexer no card: a mensagem vem da regra oficial.
    run(opportunity, to, { optimistic: kind === 'ADVANCE' }).catch((error: unknown) => {
      const needsData = error instanceof ApiError && error.code === 'REQUIREMENTS_NOT_MET';
      toast({
        tone: 'error',
        title: `Não foi possível mover ${opportunity.code}`,
        description: error instanceof Error ? error.message : undefined,
        action:
          needsData && onOpenOpportunity
            ? { label: 'Completar dados da oportunidade', onClick: () => onOpenOpportunity(opportunity.id) }
            : undefined,
      });
    });
  }

  const dialog = (
    <ReasonDialog
      // nova chave a cada movimento: o formulário começa limpo
      key={pending ? `${pending.opportunity.id}-${pending.to}` : 'none'}
      pending={pending}
      meta={meta}
      isSubmitting={changeStage.isPending}
      error={changeStage.error}
      onCancel={() => setPending(null)}
      onConfirm={(reason) => {
        if (!pending) return;
        run(pending.opportunity, pending.to, { reason })
          .then(() => setPending(null))
          .catch(() => {}); // erro exibido dentro do diálogo
      }}
    />
  );

  return { requestMove, dialog };
}

function ReasonDialog({
  pending,
  meta,
  isSubmitting,
  error,
  onCancel,
  onConfirm,
}: {
  pending: PendingMove | null;
  meta: Meta | undefined;
  isSubmitting: boolean;
  error: unknown;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const isLoss = pending?.kind === 'LOSS';
  const tooShort = reason.trim().length < 3;

  return (
    <Modal
      open={pending !== null}
      onClose={onCancel}
      title={
        pending
          ? isLoss
            ? `Marcar ${pending.opportunity.code} como perdida`
            : `Voltar ${pending.opportunity.code} para ${stageLabel(meta, pending.to)}`
          : ''
      }
    >
      {pending && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!tooShort) onConfirm(reason.trim());
          }}
          className="space-y-4"
        >
          <p className="text-sm text-stone-600">
            {pending.opportunity.companyName} · hoje em <strong>{stageLabel(meta, pending.opportunity.stage)}</strong>.{' '}
            {isLoss
              ? 'Perdida é um estado final: a oportunidade sai do funil e não pode ser reaberta.'
              : 'O retorno fica registrado no histórico com o motivo.'}
          </p>

          <Field label={isLoss ? 'Motivo da perda' : 'Motivo do retorno'} hint="Obrigatório. Ajuda a entender o funil depois.">
            <textarea
              autoFocus
              required
              minLength={3}
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className={inputClass}
              placeholder={isLoss ? 'Ex.: cliente fechou com concorrente' : 'Ex.: cliente pediu revisão da quantidade'}
            />
          </Field>

          {isLoss && (
            <div className="flex flex-wrap gap-1.5" aria-label="Motivos frequentes">
              {LOSS_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setReason(suggestion)}
                  className="rounded-full border border-stone-300 px-2.5 py-1 text-xs text-stone-700 hover:bg-stone-100"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          <ApiErrorMessage error={error} />

          <div className="flex justify-end gap-2">
            <Button onClick={onCancel}>Cancelar</Button>
            <Button type="submit" variant={isLoss ? 'danger' : 'primary'} disabled={tooShort || isSubmitting}>
              {isSubmitting ? 'Salvando…' : isLoss ? 'Marcar como perdida' : 'Voltar etapa'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
