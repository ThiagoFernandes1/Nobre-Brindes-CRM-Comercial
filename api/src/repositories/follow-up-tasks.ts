import type { Queryable } from '../db/pool.js';
import type { OpenTask, PlannedFollowUp } from '../domain/follow-up.js';
import type { Stage } from '../domain/stages.js';
import type { IsoDate } from '../lib/dates.js';

export async function findOpenTask(db: Queryable, opportunityId: number): Promise<OpenTask | null> {
  const { rows } = await db.query(
    `SELECT id, due_date, reason, title FROM follow_up_tasks WHERE opportunity_id = $1 AND status = 'OPEN'`,
    [opportunityId],
  );
  const row = rows[0];
  return row ? { id: Number(row.id), dueDate: row.due_date, reason: row.reason, title: row.title } : null;
}

export async function insertTask(db: Queryable, opportunityId: number, plan: PlannedFollowUp): Promise<void> {
  await db.query(
    `INSERT INTO follow_up_tasks (opportunity_id, due_date, reason, title) VALUES ($1, $2, $3, $4)`,
    [opportunityId, plan.dueDate, plan.reason, plan.title],
  );
}

export async function updateTaskPlan(db: Queryable, taskId: number, plan: PlannedFollowUp): Promise<void> {
  await db.query(
    `UPDATE follow_up_tasks SET due_date = $2, reason = $3, title = $4, updated_at = now() WHERE id = $1`,
    [taskId, plan.dueDate, plan.reason, plan.title],
  );
}

export async function closeTask(
  db: Queryable,
  taskId: number,
  status: 'DONE' | 'CANCELED',
  closedByContactId: number | null = null,
): Promise<void> {
  await db.query(
    `UPDATE follow_up_tasks
        SET status = $2, closed_by_contact_id = $3, closed_at = now(), updated_at = now()
      WHERE id = $1`,
    [taskId, status, closedByContactId],
  );
}

export interface AgendaTask {
  id: number;
  dueDate: IsoDate;
  reason: string;
  title: string;
  opportunity: {
    id: number;
    code: string;
    companyName: string;
    stage: Stage;
    estimatedValue: number | null;
    seller: { id: number; name: string };
  };
}

export async function findOpenAgenda(
  db: Queryable,
  filters: { sellerId?: number; dueUntil?: IsoDate } = {},
): Promise<AgendaTask[]> {
  const params: unknown[] = [];
  const conditions = [`t.status = 'OPEN'`];
  if (filters.sellerId) {
    params.push(filters.sellerId);
    conditions.push(`o.seller_id = $${params.length}`);
  }
  if (filters.dueUntil) {
    params.push(filters.dueUntil);
    conditions.push(`t.due_date <= $${params.length}`);
  }
  const { rows } = await db.query(
    `SELECT t.id, t.due_date, t.reason, t.title,
            o.id AS opportunity_id, o.code, o.company_name, o.stage, o.estimated_value,
            s.id AS seller_id, s.name AS seller_name
       FROM follow_up_tasks t
       JOIN opportunities o ON o.id = t.opportunity_id
       JOIN sellers s ON s.id = o.seller_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY t.due_date, o.estimated_value DESC NULLS LAST`,
    params,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    dueDate: row.due_date,
    reason: row.reason,
    title: row.title,
    opportunity: {
      id: row.opportunity_id,
      code: row.code,
      companyName: row.company_name,
      stage: row.stage,
      estimatedValue: row.estimated_value,
      seller: { id: row.seller_id, name: row.seller_name },
    },
  }));
}
