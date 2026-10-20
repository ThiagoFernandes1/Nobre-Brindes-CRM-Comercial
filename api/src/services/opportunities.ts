import { withTransaction, type Db, type Queryable } from '../db/pool.js';
import { assessAttention, type Attention } from '../domain/attention.js';
import { toStageSubject, type Opportunity } from '../domain/opportunity.js';
import { isFinal, STAGE_LABELS, type Stage } from '../domain/stages.js';
import { checkTransition, stageInvariantViolations } from '../domain/transitions.js';
import { AppError, notFound } from '../http/errors.js';
import type { IsoDate } from '../lib/dates.js';
import {
  findContacts,
  findStageHistory,
  insertContact,
  insertStageHistory,
  sellerExists,
  type Contact,
  type ContactChannel,
  type StageHistoryEntry,
} from '../repositories/activity.js';
import { closeTask, findOpenTask } from '../repositories/follow-up-tasks.js';
import {
  findOpportunities,
  findOpportunityById,
  insertOpportunity,
  recordContactOnOpportunity,
  replaceItems,
  updateOpportunityFields,
  updateStage,
  type OpportunityFields,
  type OpportunityFilters,
} from '../repositories/opportunities.js';
import { syncFollowUpTask } from './follow-ups.js';

/** Quem fez a ação. Sem autenticação nesta versão: vem de um header informativo (ver README > Segurança). */
export type Actor = string | null;

export interface OpportunityView extends Opportunity {
  attention: Attention;
}

export interface OpportunityDetail extends OpportunityView {
  history: StageHistoryEntry[];
  contacts: Contact[];
}

function toView(opportunity: Opportunity, today: IsoDate): OpportunityView {
  return { ...opportunity, attention: assessAttention(opportunity, today) };
}

/** Mais urgente primeiro; em empate, o retorno que vence antes; por fim, maior valor. */
function byUrgency(a: OpportunityView, b: OpportunityView): number {
  return (
    b.attention.score - a.attention.score ||
    (a.attention.nextFollowUp?.dueDate ?? '9999').localeCompare(b.attention.nextFollowUp?.dueDate ?? '9999') ||
    (b.estimatedValue ?? 0) - (a.estimatedValue ?? 0)
  );
}

export async function listOpportunities(
  db: Queryable,
  filters: OpportunityFilters & { needsAttention?: boolean },
  today: IsoDate,
): Promise<OpportunityView[]> {
  const views = (await findOpportunities(db, filters)).map((o) => toView(o, today));
  const filtered = filters.needsAttention ? views.filter((v) => v.attention.level !== 'OK') : views;
  return filtered.sort(byUrgency);
}

export async function getOpportunityDetail(db: Queryable, id: number, today: IsoDate): Promise<OpportunityDetail> {
  const opportunity = await findOpportunityById(db, id);
  if (!opportunity) throw notFound('Oportunidade');
  const [history, contacts] = await Promise.all([findStageHistory(db, id), findContacts(db, id)]);
  return { ...toView(opportunity, today), history, contacts };
}

export interface ItemInput {
  description: string;
  quantity: number;
}

export interface CreateOpportunityInput extends OpportunityFields {
  items: ItemInput[];
}

async function assertSellerExists(db: Queryable, sellerId: number) {
  if (!(await sellerExists(db, sellerId))) {
    throw new AppError(422, 'SELLER_NOT_FOUND', 'Vendedor não encontrado.');
  }
}

export async function createOpportunity(
  db: Db,
  input: CreateOpportunityInput,
  actor: Actor,
  today: IsoDate,
): Promise<OpportunityView> {
  return withTransaction(db, async (client) => {
    await assertSellerExists(client, input.sellerId);
    const id = await insertOpportunity(client, { ...input, leadReceivedOn: today });
    await replaceItems(client, id, input.items);
    await insertStageHistory(client, {
      opportunityId: id,
      fromStage: null,
      toStage: 'PRIMEIRO_CONTATO',
      kind: 'CREATED',
      reason: 'Oportunidade criada',
      changedBy: actor,
    });
    const created = (await findOpportunityById(client, id))!;
    await syncFollowUpTask(client, created);
    return toView(created, today);
  });
}

export type UpdateOpportunityInput = Partial<OpportunityFields> & { items?: ItemInput[] };

async function lockOpportunity(client: Queryable, id: number): Promise<Opportunity> {
  const opportunity = await findOpportunityById(client, id, { forUpdate: true });
  if (!opportunity) throw notFound('Oportunidade');
  return opportunity;
}

export async function updateOpportunity(
  db: Db,
  id: number,
  input: UpdateOpportunityInput,
  today: IsoDate,
): Promise<OpportunityView> {
  return withTransaction(db, async (client) => {
    const current = await lockOpportunity(client, id);
    if (isFinal(current.stage)) {
      throw new AppError(
        409,
        'OPPORTUNITY_CLOSED',
        `Oportunidades em ${STAGE_LABELS[current.stage]} não podem ser editadas.`,
      );
    }

    const fields: OpportunityFields = {
      companyName: input.companyName ?? current.companyName,
      sellerId: input.sellerId ?? current.seller.id,
      estimatedValue: input.estimatedValue !== undefined ? input.estimatedValue : current.estimatedValue,
      proposalValidUntil: input.proposalValidUntil !== undefined ? input.proposalValidUntil : current.proposalValidUntil,
      eventDate: input.eventDate !== undefined ? input.eventDate : current.eventDate,
      notes: input.notes !== undefined ? input.notes : current.notes,
    };

    // A etapa atual continua exigindo o que exigiu para entrar nela (ex.: não dá para apagar o valor em Follow-up).
    const violations = stageInvariantViolations(
      { ...fields, itemCount: input.items?.length ?? current.items.length },
      current.stage,
    );
    if (violations.length > 0) {
      throw new AppError(
        422,
        'REQUIREMENTS_NOT_MET',
        `Em ${STAGE_LABELS[current.stage]} a oportunidade precisa manter estes dados: ${violations.map((v) => v.message).join(' ')}`,
        { missing: violations },
      );
    }

    if (fields.sellerId !== current.seller.id) await assertSellerExists(client, fields.sellerId);
    await updateOpportunityFields(client, id, fields);
    if (input.items) await replaceItems(client, id, input.items);

    const updated = (await findOpportunityById(client, id))!;
    await syncFollowUpTask(client, updated);
    return toView(updated, today);
  });
}

export interface ChangeStageInput {
  toStage: Stage;
  /** Etapa que o usuário via na tela. Se mudou nesse meio-tempo, a operação é recusada em vez de sobrescrever. */
  expectedFromStage?: Stage;
  reason?: string | null;
}

export async function changeStage(
  db: Db,
  id: number,
  input: ChangeStageInput,
  actor: Actor,
  today: IsoDate,
): Promise<OpportunityView> {
  return withTransaction(db, async (client) => {
    const current = await lockOpportunity(client, id);

    if (input.expectedFromStage && input.expectedFromStage !== current.stage) {
      throw new AppError(
        409,
        'STALE_STAGE',
        `Esta oportunidade já foi movida para ${STAGE_LABELS[current.stage]}. Atualize a tela e tente novamente.`,
        { currentStage: current.stage },
      );
    }

    const check = checkTransition(toStageSubject(current), input.toStage, { reason: input.reason, today });
    if (!check.ok) {
      throw new AppError(422, check.code, check.message, check.missing ? { missing: check.missing } : undefined);
    }

    const reason = input.reason?.trim() || null;
    await updateStage(client, id, input.toStage, check.kind === 'LOSS' ? reason : null);
    await insertStageHistory(client, {
      opportunityId: id,
      fromStage: current.stage,
      toStage: input.toStage,
      kind: check.kind,
      reason,
      changedBy: actor,
    });

    const updated = (await findOpportunityById(client, id))!;
    await syncFollowUpTask(client, updated);
    return toView(updated, today);
  });
}

export interface RegisterContactInput {
  channel: ContactChannel;
  summary: string;
  contactedOn?: IsoDate;
  nextFollowUpAt?: IsoDate | null;
}

/**
 * Registrar um contato é o que "cumpre" o retorno: fecha a tarefa aberta e a automação agenda a próxima
 * (na data combinada com o cliente, se houver, ou pela cadência da etapa).
 */
export async function registerContact(
  db: Db,
  id: number,
  input: RegisterContactInput,
  actor: Actor,
  today: IsoDate,
): Promise<OpportunityView> {
  const contactedOn = input.contactedOn ?? today;
  if (contactedOn > today) {
    throw new AppError(422, 'CONTACT_IN_FUTURE', 'A data do contato não pode estar no futuro.');
  }
  const nextFollowUpAt = input.nextFollowUpAt ?? null;
  if (nextFollowUpAt && nextFollowUpAt < today) {
    throw new AppError(422, 'FOLLOW_UP_IN_PAST', 'A data do próximo retorno não pode estar no passado.');
  }

  return withTransaction(db, async (client) => {
    await lockOpportunity(client, id);
    const contactId = await insertContact(client, {
      opportunityId: id,
      contactedOn,
      channel: input.channel,
      summary: input.summary.trim(),
      nextFollowUpAt,
      recordedBy: actor,
    });
    await recordContactOnOpportunity(client, id, contactedOn, nextFollowUpAt);

    const openTask = await findOpenTask(client, id);
    if (openTask) await closeTask(client, openTask.id, 'DONE', contactId);

    const updated = (await findOpportunityById(client, id))!;
    await syncFollowUpTask(client, updated);
    return toView(updated, today);
  });
}
