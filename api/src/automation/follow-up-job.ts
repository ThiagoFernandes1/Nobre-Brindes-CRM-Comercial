import { withTransaction, type Db } from '../db/pool.js';
import type { IsoDate } from '../lib/dates.js';
import { getAgenda, reconcileAllFollowUps, type ReconcileSummary } from '../services/follow-ups.js';
import { buildSellerDigests } from './digest.js';
import type { Notifier } from './notifier.js';

export interface FollowUpJobResult {
  ranAt: string;
  today: IsoDate;
  tasks: ReconcileSummary;
  digestsSent: string[];
  digestErrors: string[];
}

/**
 * Envia o resumo do dia para cada vendedor com pendências, no máximo uma vez por vendedor por dia.
 * O registro em follow_up_digests e o envio ficam na mesma transação: se o envio falhar,
 * o registro é desfeito e a próxima execução tenta de novo.
 */
export async function sendDailyDigests(db: Db, notifier: Notifier, today: IsoDate) {
  const digests = buildSellerDigests(await getAgenda(db, today), today);
  const sent: string[] = [];
  const errors: string[] = [];

  for (const digest of digests) {
    try {
      const delivered = await withTransaction(db, async (client) => {
        const { rowCount } = await client.query(
          `INSERT INTO follow_up_digests (seller_id, digest_date, payload, delivered_via)
           VALUES ($1, $2, $3, $4) ON CONFLICT (seller_id, digest_date) DO NOTHING`,
          [digest.sellerId, today, JSON.stringify(digest), notifier.channel],
        );
        if (rowCount === 0) return false; // já enviado hoje
        await notifier.send(digest);
        return true;
      });
      if (delivered) sent.push(digest.sellerName);
    } catch (error) {
      errors.push(`${digest.sellerName}: ${(error as Error).message}`);
    }
  }
  return { sent, errors };
}

export async function runFollowUpJob(db: Db, notifier: Notifier, today: IsoDate): Promise<FollowUpJobResult> {
  const tasks = await reconcileAllFollowUps(db);
  const digests = await sendDailyDigests(db, notifier, today);
  return { ranAt: new Date().toISOString(), today, tasks, digestsSent: digests.sent, digestErrors: digests.errors };
}
