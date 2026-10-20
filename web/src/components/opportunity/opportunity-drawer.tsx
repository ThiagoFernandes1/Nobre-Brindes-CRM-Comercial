'use client';

import { useState, type ReactNode } from 'react';
import { formatCurrency, formatDate, formatDateTime, relativeDay } from '@/lib/format';
import { useMeta, useOpportunityDetail, useUpdateOpportunity } from '@/lib/queries';
import { availableMoves, stageLabel } from '@/lib/stage-moves';
import type { Meta, OpportunityDetail, StageHistoryEntry } from '@/lib/types';
import { useStageMover } from '../board/use-stage-mover';
import { Modal } from '../ui/modal';
import { Button, ErrorState, SeverityBadge, Spinner } from '../ui/primitives';
import { useToast } from '../ui/toast';
import { CHANNEL_LABELS, ContactForm } from './contact-form';
import { OpportunityForm } from './opportunity-form';

export function OpportunityDrawer({ opportunityId, onClose }: { opportunityId: number | null; onClose: () => void }) {
  const detail = useOpportunityDetail(opportunityId);
  const meta = useMeta();

  return (
    <Modal
      open={opportunityId !== null}
      onClose={onClose}
      variant="side"
      title={
        detail.data ? (
          <div>
            <p className="font-mono text-xs text-stone-500">
              {detail.data.code} · {detail.data.seller.name}
            </p>
            <h2 className="text-lg font-semibold leading-tight">{detail.data.companyName}</h2>
          </div>
        ) : (
          <h2 className="text-lg font-semibold">Oportunidade</h2>
        )
      }
    >
      {detail.isPending || meta.isPending ? (
        <Spinner />
      ) : detail.isError || meta.isError ? (
        <ErrorState
          title="Não foi possível abrir a oportunidade"
          message={(detail.error ?? meta.error)?.message ?? ''}
          onRetry={() => void detail.refetch()}
        />
      ) : (
        // key: trocar de oportunidade reseta os formulários
        <DrawerBody key={detail.data.id} opportunity={detail.data} meta={meta.data} />
      )}
    </Modal>
  );
}

function DrawerBody({ opportunity, meta }: { opportunity: OpportunityDetail; meta: Meta }) {
  const [mode, setMode] = useState<'view' | 'contact' | 'edit'>('view');
  const { requestMove, dialog } = useStageMover(meta);
  const update = useUpdateOpportunity(opportunity.id);
  const toast = useToast();
  const isClosed = opportunity.stage === 'FECHAMENTO' || opportunity.stage === 'PERDIDA';
  const next = opportunity.attention.nextFollowUp;
  const moves = availableMoves(meta, opportunity.stage);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-brand-700 px-2.5 py-0.5 font-medium text-white">{stageLabel(meta, opportunity.stage)}</span>
        <span className="font-semibold">{formatCurrency(opportunity.estimatedValue)}</span>
      </div>

      {!isClosed && (
        <section aria-label="Alertas">
          {opportunity.attention.flags.length === 0 ? (
            <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">Em dia: nenhum alerta para esta negociação.</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {opportunity.attention.flags.map((flag) => (
                <li key={flag.code}>
                  <SeverityBadge severity={flag.severity}>{flag.message}</SeverityBadge>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {opportunity.stage === 'PERDIDA' && (
        <p className="rounded-lg bg-stone-100 px-3 py-2 text-sm text-stone-700">
          <strong>Motivo da perda:</strong> {opportunity.lossReason}
        </p>
      )}

      {next && (
        <section className="rounded-xl border border-stone-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Próximo retorno</p>
              <p className="mt-0.5 font-semibold">{next.title}</p>
              <p className={`text-sm ${next.daysLate > 0 ? 'font-medium text-red-700' : 'text-stone-600'}`}>
                {formatDate(next.dueDate)} ({next.daysLate > 0 ? `atrasado há ${next.daysLate} dias` : relativeDay(next.dueDate, meta.today)})
              </p>
            </div>
            {mode !== 'contact' && (
              <Button variant="primary" onClick={() => setMode('contact')}>
                Registrar contato
              </Button>
            )}
          </div>
          {mode === 'contact' && (
            <div className="mt-3">
              <ContactForm opportunityId={opportunity.id} today={meta.today} onDone={() => setMode('view')} />
            </div>
          )}
        </section>
      )}

      {moves.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-stone-800">Mover etapa</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {moves.map(({ to, kind }) => (
              <Button key={to} variant={kind === 'LOSS' ? 'ghost' : kind === 'ADVANCE' ? 'primary' : 'secondary'} onClick={() => requestMove(opportunity, to)}>
                {kind === 'ADVANCE' ? `Avançar para ${stageLabel(meta, to)} →` : kind === 'RETURN' ? `← Voltar para ${stageLabel(meta, to)}` : 'Marcar como perdida'}
              </Button>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-stone-800">Dados da negociação</h3>
          {!isClosed && mode !== 'edit' && (
            <Button
              variant="ghost"
              onClick={() => {
                update.reset();
                setMode('edit');
              }}
            >
              Editar
            </Button>
          )}
        </div>
        {mode === 'edit' ? (
          <div className="mt-2">
            <OpportunityForm
              initial={opportunity}
              submitLabel="Salvar alterações"
              isSubmitting={update.isPending}
              error={update.error}
              onCancel={() => setMode('view')}
              onSubmit={(input) =>
                update.mutate(input, {
                  onSuccess: () => {
                    toast({ tone: 'success', title: 'Oportunidade atualizada' });
                    setMode('view');
                  },
                })
              }
            />
          </div>
        ) : (
          <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Info label="Itens de brinde">
              {opportunity.items.length === 0 ? (
                <Missing>Nenhum item informado</Missing>
              ) : (
                <ul>
                  {opportunity.items.map((item) => (
                    <li key={item.id}>
                      {item.description} · {item.quantity.toLocaleString('pt-BR')} un.
                    </li>
                  ))}
                </ul>
              )}
            </Info>
            <Info label="Valor estimado">{opportunity.estimatedValue === null ? <Missing>Não informado</Missing> : formatCurrency(opportunity.estimatedValue)}</Info>
            <Info label="Validade da proposta">
              {opportunity.proposalValidUntil ? formatDate(opportunity.proposalValidUntil) : <Missing>Não informada</Missing>}
            </Info>
            <Info label="Evento do cliente">{opportunity.eventDate ? formatDate(opportunity.eventDate) : <Missing>Não informado</Missing>}</Info>
            <Info label="Último contato">
              {opportunity.lastContactAt ? `${formatDate(opportunity.lastContactAt)} (${relativeDay(opportunity.lastContactAt, meta.today)})` : <Missing>Nenhum</Missing>}
            </Info>
            <Info label="Entrada do lead">{formatDate(opportunity.leadReceivedOn)}</Info>
            {opportunity.notes && (
              <div className="sm:col-span-2">
                <Info label="Observações">
                  <span className="whitespace-pre-line">{opportunity.notes}</span>
                </Info>
              </div>
            )}
          </dl>
        )}
      </section>

      <section>
        <h3 className="text-sm font-semibold text-stone-800">Contatos</h3>
        {opportunity.contacts.length === 0 ? (
          <p className="mt-1 text-sm text-stone-500">Nenhum contato registrado no CRM ainda.</p>
        ) : (
          <ol className="mt-2 space-y-3 border-l-2 border-stone-200 pl-4">
            {opportunity.contacts.map((contact) => (
              <li key={contact.id} className="text-sm">
                <p className="text-xs text-stone-500">
                  {formatDate(contact.contactedOn)} · {CHANNEL_LABELS[contact.channel]}
                  {contact.recordedBy && ` · ${contact.recordedBy}`}
                </p>
                <p className="whitespace-pre-line">{contact.summary}</p>
                {contact.nextFollowUpAt && <p className="text-xs text-stone-500">Retorno combinado: {formatDate(contact.nextFollowUpAt)}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <h3 className="text-sm font-semibold text-stone-800">Histórico de etapas</h3>
        <ol className="mt-2 space-y-3 border-l-2 border-stone-200 pl-4">
          {opportunity.history.map((entry) => (
            <HistoryItem key={entry.id} entry={entry} meta={meta} />
          ))}
        </ol>
      </section>

      {dialog}
    </div>
  );
}

const KIND_LABEL: Record<StageHistoryEntry['kind'], string> = {
  CREATED: 'Entrou no funil em',
  ADVANCE: 'Avançou',
  RETURN: 'Voltou',
  LOSS: 'Marcada como perdida',
};

function HistoryItem({ entry, meta }: { entry: StageHistoryEntry; meta: Meta }) {
  return (
    <li className="text-sm">
      <p className="text-xs text-stone-500">
        {formatDateTime(entry.changedAt)}
        {entry.changedBy && ` · ${entry.changedBy}`}
      </p>
      <p>
        <span className="font-medium">{KIND_LABEL[entry.kind]}</span>{' '}
        {entry.fromStage ? (
          <>
            {stageLabel(meta, entry.fromStage)} → {stageLabel(meta, entry.toStage)}
          </>
        ) : (
          stageLabel(meta, entry.toStage)
        )}
      </p>
      {entry.reason && <p className="text-stone-600">“{entry.reason}”</p>}
    </li>
  );
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-stone-500">{label}</dt>
      <dd className="text-stone-900">{children}</dd>
    </div>
  );
}

function Missing({ children }: { children: ReactNode }) {
  return <span className="italic text-stone-400">{children}</span>;
}
