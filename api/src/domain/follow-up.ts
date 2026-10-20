import { addDays, formatBr, type IsoDate } from '../lib/dates.js';
import { isFinal, type OpenStage, type Stage } from './stages.js';

// dias até o próximo retorno, contando do último contato
export const FOLLOW_UP_CADENCE_DAYS: Record<OpenStage, number> = {
  PRIMEIRO_CONTATO: 1,
  APRESENTACAO_ORCAMENTO: 2,
  FOLLOW_UP: 3,
  FORECAST: 2,
};

// prazo mínimo de produção antes do evento
export const PRODUCTION_LEAD_DAYS = 7;

export type FollowUpReason =
  | 'FIRST_CONTACT_SLA'
  | 'CADENCE'
  | 'CLIENT_REQUESTED'
  | 'PROPOSAL_EXPIRING'
  | 'EVENT_DEADLINE';

export interface FollowUpSubject {
  stage: Stage;
  leadReceivedOn: IsoDate;
  lastContactAt: IsoDate | null;
  /** retorno combinado com o cliente */
  requestedFollowUpAt: IsoDate | null;
  proposalValidUntil: IsoDate | null;
  eventDate: IsoDate | null;
}

export interface PlannedFollowUp {
  dueDate: IsoDate;
  reason: FollowUpReason;
  title: string;
}

const CADENCE_TITLES: Record<OpenStage, string> = {
  PRIMEIRO_CONTATO: 'Retomar contato e qualificar o lead',
  APRESENTACAO_ORCAMENTO: 'Apresentar o orçamento ao cliente',
  FOLLOW_UP: 'Cobrar retorno sobre a proposta',
  FORECAST: 'Confirmar o fechamento do pedido',
};

const STAGES_WITH_PROPOSAL: readonly Stage[] = ['APRESENTACAO_ORCAMENTO', 'FOLLOW_UP', 'FORECAST'];

// Pega o prazo mais cedo entre a cadência (ou a data combinada), a véspera do vencimento da proposta
// e o prazo de produção do evento. Prazo anterior ao último contato é ignorado porque já foi tratado.
export function planFollowUp(subject: FollowUpSubject): PlannedFollowUp | null {
  if (isFinal(subject.stage)) return null;
  const stage = subject.stage;
  const lastContact = subject.lastContactAt;

  const candidates: PlannedFollowUp[] = [];

  if (lastContact === null) {
    candidates.push({
      dueDate: subject.leadReceivedOn,
      reason: 'FIRST_CONTACT_SLA',
      title: 'Fazer o primeiro contato com o lead',
    });
  } else if (subject.requestedFollowUpAt) {
    candidates.push({
      dueDate: subject.requestedFollowUpAt,
      reason: 'CLIENT_REQUESTED',
      title: 'Retorno combinado com o cliente',
    });
  } else {
    candidates.push({
      dueDate: addDays(lastContact, FOLLOW_UP_CADENCE_DAYS[stage]),
      reason: 'CADENCE',
      title: CADENCE_TITLES[stage],
    });
  }

  const isAfterLastContact = (date: IsoDate) => lastContact === null || date > lastContact;

  if (subject.proposalValidUntil && STAGES_WITH_PROPOSAL.includes(stage)) {
    const dayBeforeExpiry = addDays(subject.proposalValidUntil, -1);
    if (isAfterLastContact(dayBeforeExpiry)) {
      candidates.push({
        dueDate: dayBeforeExpiry,
        reason: 'PROPOSAL_EXPIRING',
        title: `Proposta vence em ${formatBr(subject.proposalValidUntil)}: buscar decisão ou renovar`,
      });
    }
  }

  if (subject.eventDate) {
    const productionDeadline = addDays(subject.eventDate, -PRODUCTION_LEAD_DAYS);
    if (isAfterLastContact(productionDeadline)) {
      candidates.push({
        dueDate: productionDeadline,
        reason: 'EVENT_DEADLINE',
        title: `Evento em ${formatBr(subject.eventDate)}: último dia para garantir a produção`,
      });
    }
  }

  return candidates.reduce((earliest, candidate) => (candidate.dueDate < earliest.dueDate ? candidate : earliest));
}

export interface OpenTask {
  id: number;
  dueDate: IsoDate;
  reason: string;
  title: string;
}

export type TaskChange =
  | { type: 'KEEP' }
  | { type: 'CREATE'; plan: PlannedFollowUp }
  | { type: 'UPDATE'; taskId: number; plan: PlannedFollowUp }
  | { type: 'CANCEL'; taskId: number };

// idempotente: o mesmo estado sempre dá KEEP
export function reconcileTask(plan: PlannedFollowUp | null, openTask: OpenTask | null): TaskChange {
  if (!plan) return openTask ? { type: 'CANCEL', taskId: openTask.id } : { type: 'KEEP' };
  if (!openTask) return { type: 'CREATE', plan };
  const unchanged =
    openTask.dueDate === plan.dueDate && openTask.reason === plan.reason && openTask.title === plan.title;
  return unchanged ? { type: 'KEEP' } : { type: 'UPDATE', taskId: openTask.id, plan };
}
