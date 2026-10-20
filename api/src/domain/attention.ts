import { daysBetween, formatBr, plural, type IsoDate } from '../lib/dates.js';
import { PRODUCTION_LEAD_DAYS, planFollowUp, type FollowUpSubject, type PlannedFollowUp } from './follow-up.js';
import { isFinal, type Stage } from './stages.js';

export type Severity = 'CRITICAL' | 'WARNING';

export type AttentionCode =
  | 'FIRST_CONTACT_OVERDUE'
  | 'FOLLOW_UP_OVERDUE'
  | 'PROPOSAL_EXPIRED'
  | 'PROPOSAL_EXPIRING'
  | 'PROPOSAL_WITHOUT_VALIDITY'
  | 'EVENT_PASSED'
  | 'EVENT_SOON';

export interface AttentionFlag {
  code: AttentionCode;
  severity: Severity;
  message: string;
}

export interface Attention {
  level: Severity | 'OK';
  flags: AttentionFlag[];
  /** Para ordenar: maior = mais urgente. */
  score: number;
  nextFollowUp: (PlannedFollowUp & { daysLate: number }) | null;
}

/** Proposta vencendo em até N dias já merece um alerta. */
export const PROPOSAL_EXPIRING_WARNING_DAYS = 3;
/** Evento em até N dias (mas fora do prazo crítico de produção) merece um alerta. */
export const EVENT_WARNING_DAYS = 14;
/** Retorno atrasado há N dias ou mais deixa de ser alerta e vira crítico. */
export const FOLLOW_UP_CRITICAL_DELAY_DAYS = 3;

const SEVERITY_WEIGHT: Record<Severity, number> = { CRITICAL: 100, WARNING: 10 };
const STAGES_WITH_SENT_PROPOSAL: readonly Stage[] = ['FOLLOW_UP', 'FORECAST'];
const STAGES_WITH_PROPOSAL: readonly Stage[] = ['APRESENTACAO_ORCAMENTO', ...STAGES_WITH_SENT_PROPOSAL];

/**
 * Responde "esta negociação precisa de atenção hoje, e por quê?".
 * Estados finais nunca pedem atenção.
 */
export function assessAttention(subject: FollowUpSubject, today: IsoDate): Attention {
  if (isFinal(subject.stage)) {
    return { level: 'OK', flags: [], score: 0, nextFollowUp: null };
  }

  const flags: AttentionFlag[] = [];
  const planned = planFollowUp(subject);
  const daysLate = planned ? Math.max(0, daysBetween(planned.dueDate, today)) : 0;

  if (planned && daysLate > 0) {
    if (planned.reason === 'FIRST_CONTACT_SLA') {
      flags.push({
        code: 'FIRST_CONTACT_OVERDUE',
        severity: 'CRITICAL',
        message: `Lead aguardando primeiro contato há ${plural(daysLate, 'dia')}`,
      });
    } else {
      flags.push({
        code: 'FOLLOW_UP_OVERDUE',
        severity: daysLate >= FOLLOW_UP_CRITICAL_DELAY_DAYS ? 'CRITICAL' : 'WARNING',
        message: `Retorno atrasado há ${plural(daysLate, 'dia')}`,
      });
    }
  }

  const validity = subject.proposalValidUntil;
  if (validity && STAGES_WITH_PROPOSAL.includes(subject.stage)) {
    const daysToExpiry = daysBetween(today, validity);
    if (daysToExpiry < 0) {
      flags.push({ code: 'PROPOSAL_EXPIRED', severity: 'CRITICAL', message: `Proposta vencida em ${formatBr(validity)}` });
    } else if (daysToExpiry <= PROPOSAL_EXPIRING_WARNING_DAYS) {
      flags.push({
        code: 'PROPOSAL_EXPIRING',
        severity: 'WARNING',
        message: daysToExpiry === 0 ? 'Proposta vence hoje' : `Proposta vence em ${plural(daysToExpiry, 'dia')}`,
      });
    }
  } else if (!validity && STAGES_WITH_SENT_PROPOSAL.includes(subject.stage)) {
    flags.push({ code: 'PROPOSAL_WITHOUT_VALIDITY', severity: 'WARNING', message: 'Proposta sem data de validade' });
  }

  if (subject.eventDate) {
    const daysToEvent = daysBetween(today, subject.eventDate);
    if (daysToEvent < 0) {
      flags.push({
        code: 'EVENT_PASSED',
        severity: 'CRITICAL',
        message: `Evento do cliente (${formatBr(subject.eventDate)}) já passou`,
      });
    } else if (daysToEvent <= PRODUCTION_LEAD_DAYS) {
      flags.push({
        code: 'EVENT_SOON',
        severity: 'CRITICAL',
        message: `Evento em ${plural(daysToEvent, 'dia')}: prazo de produção em risco`,
      });
    } else if (daysToEvent <= EVENT_WARNING_DAYS) {
      flags.push({ code: 'EVENT_SOON', severity: 'WARNING', message: `Evento em ${plural(daysToEvent, 'dia')}` });
    }
  }

  flags.sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity]);
  const score = flags.reduce((sum, flag) => sum + SEVERITY_WEIGHT[flag.severity], 0) + daysLate;
  const level = flags[0]?.severity ?? 'OK';

  return { level, flags, score, nextFollowUp: planned ? { ...planned, daysLate } : null };
}
