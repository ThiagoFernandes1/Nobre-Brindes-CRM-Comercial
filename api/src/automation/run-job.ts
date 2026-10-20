// Execução avulsa do job de follow-up, para agendador externo (cron, Cloud Scheduler, GitHub Actions...).
import { config } from '../config.js';
import { createPool } from '../db/pool.js';
import { today } from '../lib/clock.js';
import { runFollowUpJob } from './follow-up-job.js';
import { createNotifier } from './notifier.js';

const db = createPool(config.DATABASE_URL);
try {
  const result = await runFollowUpJob(db, createNotifier(config.FOLLOW_UP_WEBHOOK_URL), today());
  console.log(JSON.stringify(result, null, 2));
  if (result.digestErrors.length > 0) process.exitCode = 1;
} finally {
  await db.end();
}
