import { withTransaction, type Db, type Queryable } from '../db/pool.js';
import { planFollowUp, reconcileTask, type TaskChange } from '../domain/follow-up.js';
import type { Opportunity } from '../domain/opportunity.js';
import { addDays, daysBetween, type IsoDate } from '../lib/dates.js';
import { findOpportunityById } from '../repositories/opportunities.js';
import {
  closeTask,
  findOpenAgenda,
  findOpenTask,
  insertTask,
  updateTaskPlan,
  type AgendaTask,
} from '../repositories/follow-up-tasks.js';

export async function syncFollowUpTask(db: Queryable, opportunity: Opportunity): Promise<TaskChange> {
  const change = reconcileTask(planFollowUp(opportunity), await findOpenTask(db, opportunity.id));
  switch (change.type) {
    case 'CREATE':
      await insertTask(db, opportunity.id, change.plan);
      break;
    case 'UPDATE':
      await updateTaskPlan(db, change.taskId, change.plan);
      break;
    case 'CANCEL':
      await closeTask(db, change.taskId, 'CANCELED');
      break;
  }
  return change;
}

export interface ReconcileSummary {
  created: number;
  updated: number;
  canceled: number;
  unchanged: number;
}

// varre tudo: cobre a carga inicial e o que os eventos da API não pegaram
export async function reconcileAllFollowUps(db: Db): Promise<ReconcileSummary> {
  const summary: ReconcileSummary = { created: 0, updated: 0, canceled: 0, unchanged: 0 };
  const { rows } = await db.query<{ id: number }>('SELECT id FROM opportunities ORDER BY id');
  for (const { id } of rows) {
    // relê com lock para não planejar em cima de dado velho
    const change = await withTransaction(db, async (client) => {
      const opportunity = await findOpportunityById(client, id, { forUpdate: true });
      return opportunity ? syncFollowUpTask(client, opportunity) : ({ type: 'KEEP' } as const);
    });
    if (change.type === 'CREATE') summary.created++;
    else if (change.type === 'UPDATE') summary.updated++;
    else if (change.type === 'CANCEL') summary.canceled++;
    else summary.unchanged++;
  }
  return summary;
}

export type AgendaBucket = 'OVERDUE' | 'TODAY' | 'UPCOMING';

export interface AgendaEntry extends AgendaTask {
  bucket: AgendaBucket;
  daysLate: number;
}

export const AGENDA_LOOKAHEAD_DAYS = 7;

export async function getAgenda(db: Queryable, today: IsoDate, sellerId?: number): Promise<AgendaEntry[]> {
  const tasks = await findOpenAgenda(db, { sellerId, dueUntil: addDays(today, AGENDA_LOOKAHEAD_DAYS) });
  return tasks.map((task) => {
    const daysLate = daysBetween(task.dueDate, today);
    const bucket: AgendaBucket = daysLate > 0 ? 'OVERDUE' : daysLate === 0 ? 'TODAY' : 'UPCOMING';
    return { ...task, bucket, daysLate: Math.max(0, daysLate) };
  });
}
