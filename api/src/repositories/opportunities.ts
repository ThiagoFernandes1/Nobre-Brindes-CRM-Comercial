import type { Queryable } from '../db/pool.js';
import type { Opportunity, OpportunityItem } from '../domain/opportunity.js';
import type { Stage } from '../domain/stages.js';
import type { IsoDate } from '../lib/dates.js';

interface OpportunityRow {
  id: number;
  code: string;
  company_name: string;
  seller_id: number;
  seller_name: string;
  estimated_value: number | null;
  stage: Stage;
  lead_received_on: IsoDate;
  last_contact_at: IsoDate | null;
  requested_follow_up_at: IsoDate | null;
  proposal_valid_until: IsoDate | null;
  event_date: IsoDate | null;
  loss_reason: string | null;
  notes: string | null;
  items: OpportunityItem[];
  stage_changed_at: Date;
  created_at: Date;
  updated_at: Date;
}

const SELECT_OPPORTUNITY = `
  SELECT o.*, s.name AS seller_name,
         COALESCE(
           (SELECT json_agg(json_build_object('id', i.id, 'description', i.description, 'quantity', i.quantity)
                            ORDER BY i.position, i.id)
              FROM opportunity_items i WHERE i.opportunity_id = o.id),
           '[]'::json
         ) AS items
    FROM opportunities o
    JOIN sellers s ON s.id = o.seller_id`;

function toOpportunity(row: OpportunityRow): Opportunity {
  return {
    id: row.id,
    code: row.code,
    companyName: row.company_name,
    seller: { id: row.seller_id, name: row.seller_name },
    estimatedValue: row.estimated_value,
    stage: row.stage,
    leadReceivedOn: row.lead_received_on,
    lastContactAt: row.last_contact_at,
    requestedFollowUpAt: row.requested_follow_up_at,
    proposalValidUntil: row.proposal_valid_until,
    eventDate: row.event_date,
    lossReason: row.loss_reason,
    notes: row.notes,
    items: row.items,
    stageChangedAt: row.stage_changed_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export interface OpportunityFilters {
  search?: string;
  sellerId?: number;
  stage?: Stage;
}

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function findOpportunities(db: Queryable, filters: OpportunityFilters = {}): Promise<Opportunity[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.search) {
    params.push(`%${escapeLike(filters.search)}%`);
    const p = `$${params.length}`;
    conditions.push(`(o.code ILIKE ${p} OR o.company_name ILIKE ${p}
      OR EXISTS (SELECT 1 FROM opportunity_items si WHERE si.opportunity_id = o.id AND si.description ILIKE ${p}))`);
  }
  if (filters.sellerId) {
    params.push(filters.sellerId);
    conditions.push(`o.seller_id = $${params.length}`);
  }
  if (filters.stage) {
    params.push(filters.stage);
    conditions.push(`o.stage = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await db.query<OpportunityRow>(`${SELECT_OPPORTUNITY} ${where} ORDER BY o.id`, params);
  return rows.map(toOpportunity);
}

// forUpdate trava a linha até o fim da transação
export async function findOpportunityById(
  db: Queryable,
  id: number,
  { forUpdate = false } = {},
): Promise<Opportunity | null> {
  if (forUpdate) {
    await db.query('SELECT 1 FROM opportunities WHERE id = $1 FOR UPDATE', [id]);
  }
  const { rows } = await db.query<OpportunityRow>(`${SELECT_OPPORTUNITY} WHERE o.id = $1`, [id]);
  return rows[0] ? toOpportunity(rows[0]) : null;
}

export interface OpportunityFields {
  companyName: string;
  sellerId: number;
  estimatedValue: number | null;
  proposalValidUntil: IsoDate | null;
  eventDate: IsoDate | null;
  notes: string | null;
}

export async function insertOpportunity(
  db: Queryable,
  fields: OpportunityFields & { leadReceivedOn: IsoDate },
): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO opportunities
       (company_name, seller_id, estimated_value, proposal_valid_until, event_date, notes, lead_received_on)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      fields.companyName,
      fields.sellerId,
      fields.estimatedValue,
      fields.proposalValidUntil,
      fields.eventDate,
      fields.notes,
      fields.leadReceivedOn,
    ],
  );
  return rows[0]!.id;
}

export async function updateOpportunityFields(db: Queryable, id: number, fields: OpportunityFields): Promise<void> {
  await db.query(
    `UPDATE opportunities
        SET company_name = $2, seller_id = $3, estimated_value = $4,
            proposal_valid_until = $5, event_date = $6, notes = $7, updated_at = now()
      WHERE id = $1`,
    [id, fields.companyName, fields.sellerId, fields.estimatedValue, fields.proposalValidUntil, fields.eventDate, fields.notes],
  );
}

export async function replaceItems(
  db: Queryable,
  opportunityId: number,
  items: Array<Omit<OpportunityItem, 'id'>>,
): Promise<void> {
  await db.query('DELETE FROM opportunity_items WHERE opportunity_id = $1', [opportunityId]);
  for (const [position, item] of items.entries()) {
    await db.query(
      'INSERT INTO opportunity_items (opportunity_id, description, quantity, position) VALUES ($1, $2, $3, $4)',
      [opportunityId, item.description, item.quantity, position],
    );
  }
}

export async function updateStage(
  db: Queryable,
  id: number,
  stage: Stage,
  lossReason: string | null,
): Promise<void> {
  await db.query(
    `UPDATE opportunities
        SET stage = $2, loss_reason = $3, stage_changed_at = now(), updated_at = now()
      WHERE id = $1`,
    [id, stage, lossReason],
  );
}

export async function recordContactOnOpportunity(
  db: Queryable,
  id: number,
  contactedOn: IsoDate,
  requestedFollowUpAt: IsoDate | null,
): Promise<void> {
  await db.query(
    `UPDATE opportunities
        SET last_contact_at = GREATEST(last_contact_at, $2::date), requested_follow_up_at = $3, updated_at = now()
      WHERE id = $1`,
    [id, contactedOn, requestedFollowUpAt],
  );
}
