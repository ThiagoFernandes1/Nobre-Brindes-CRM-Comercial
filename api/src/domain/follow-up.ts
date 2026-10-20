import { addDays, formatBr, type IsoDate } from '../lib/dates.js';
import { isFinal, type OpenStage, type Stage } from './stages.js';

/** Dias sem contato tolerados em cada etapa antes do próximo retorno. */
export const FOLLOW_UP_CADENCE_DAYS: Record<OpenStage, number> = {
  PRIMEIRO_CONTATO: 1,
  APRESENTACAO_ORCAMENTO: 2,
  FOLLOW_UP: 3,
  FORECAST: 2,
};

/** Antecedência mínima antes do evento do cliente para produzir brinde personalizado. */
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
  /** Data de retorno combinada com o cliente no último contato. */
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

/**
 * Calcula o próximo retorno que o vendedor deve fazer. Função pura e determinística:
 * depende só dos dados da oportunidade, não de "hoje" — quem decide se está atrasado é quem consulta.
 *
 * Começa pela cadência da etapa (ou pela data combinada com o cliente) e antecipa o retorno quando
 * a proposta vai vencer ou quando o prazo de produção do evento está chegando. Um prazo que cai
 * antes do último contato é ignorado: o vendedor já falou com o cliente depois dele.
 */
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

  // Vence o prazo mais cedo; em empate, a ordem acima (mais específica primeiro) desempata.
  return candidates.reduce((earliest, candidate) => (candidate.dueDate < earliest.dueDate ? candidate : earliest));
}
