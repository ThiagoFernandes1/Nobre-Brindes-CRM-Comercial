import type { Queryable } from '../db/pool.js';
import type { Stage } from '../domain/stages.js';
import type { IsoDate } from '../lib/dates.js';

export type StageChangeKind = 'CREATED' | 'ADVANCE' | 'RETURN' | 'LOSS';

export interface StageHistoryEntry {
  id: number;
  fromStage: Stage | null;
  toStage: Stage;
  kind: StageChangeKind;
  reason: string | null;
  changedBy: string | null;
  changedAt: string;
}

export async function insertStageHistory(
  db: Queryable,
  entry: { opportunityId: number; fromStage: Stage | null; toStage: Stage; kind: StageChangeKind; reason: string | null; changedBy: string | null },
): Promise<void> {
  await db.query(
    `INSERT INTO stage_history (opportunity_id, from_stage, to_stage, kind, reason, changed_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [entry.opportunityId, entry.fromStage, entry.toStage, entry.kind, entry.reason, entry.changedBy],
  );
}

export async function findStageHistory(db: Queryable, opportunityId: number): Promise<StageHistoryEntry[]> {
  const { rows } = await db.query(
    `SELECT id, from_stage, to_stage, kind, reason, changed_by, changed_at
       FROM stage_history WHERE opportunity_id = $1 ORDER BY changed_at DESC, id DESC`,
    [opportunityId],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    fromStage: row.from_stage,
    toStage: row.to_stage,
    kind: row.kind,
    reason: row.reason,
    changedBy: row.changed_by,
    changedAt: (row.changed_at as Date).toISOString(),
  }));
}

export const CONTACT_CHANNELS = ['PHONE', 'WHATSAPP', 'EMAIL', 'MEETING'] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

export interface Contact {
  id: number;
  contactedOn: IsoDate;
  channel: ContactChannel;
  summary: string;
  nextFollowUpAt: IsoDate | null;
  recordedBy: string | null;
  createdAt: string;
}

export async function insertContact(
  db: Queryable,
  contact: Omit<Contact, 'id' | 'createdAt'> & { opportunityId: number },
): Promise<number> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO contacts (opportunity_id, contacted_on, channel, summary, next_follow_up_at, recorded_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [contact.opportunityId, contact.contactedOn, contact.channel, contact.summary, contact.nextFollowUpAt, contact.recordedBy],
  );
  return Number(rows[0]!.id);
}

export async function findContacts(db: Queryable, opportunityId: number): Promise<Contact[]> {
  const { rows } = await db.query(
    `SELECT id, contacted_on, channel, summary, next_follow_up_at, recorded_by, created_at
       FROM contacts WHERE opportunity_id = $1 ORDER BY contacted_on DESC, id DESC`,
    [opportunityId],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    contactedOn: row.contacted_on,
    channel: row.channel,
    summary: row.summary,
    nextFollowUpAt: row.next_follow_up_at,
    recordedBy: row.recorded_by,
    createdAt: (row.created_at as Date).toISOString(),
  }));
}

export interface Seller {
  id: number;
  name: string;
}

export async function findSellers(db: Queryable): Promise<Seller[]> {
  const { rows } = await db.query<Seller>('SELECT id, name FROM sellers ORDER BY name');
  return rows;
}

export async function sellerExists(db: Queryable, id: number): Promise<boolean> {
  const { rowCount } = await db.query('SELECT 1 FROM sellers WHERE id = $1', [id]);
  return rowCount === 1;
}
