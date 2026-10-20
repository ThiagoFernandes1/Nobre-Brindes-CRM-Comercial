import { buildApp } from './app.js';
import { runFollowUpJob } from './automation/follow-up-job.js';
import { createNotifier } from './automation/notifier.js';
import { config } from './config.js';
import { createPool } from './db/pool.js';
import { today } from './lib/clock.js';

const db = createPool(config.DATABASE_URL);
const notifier = createNotifier(config.FOLLOW_UP_WEBHOOK_URL);
const app = await buildApp({
  db,
  today,
  notifier,
  apiKey: config.API_KEY,
  corsOrigin: config.CORS_ORIGIN,
  logger: true,
});

if (config.REFERENCE_DATE) {
  app.log.warn(`REFERENCE_DATE ativa: as regras consideram hoje = ${config.REFERENCE_DATE}`);
}

// Job de follow-up dentro do processo: simples para rodar localmente. Em produção, prefira um agendador
// externo chamando `npm run job:follow-ups` (ver README).
let jobRunning = false;
async function tick() {
  if (jobRunning) return;
  jobRunning = true;
  try {
    const result = await runFollowUpJob(db, notifier, today());
    app.log.info({ followUpJob: result }, 'job de follow-up executado');
  } catch (error) {
    app.log.error({ err: error }, 'falha no job de follow-up');
  } finally {
    jobRunning = false;
  }
}

const intervalMs = config.FOLLOW_UP_JOB_INTERVAL_MINUTES * 60_000;
const timer = intervalMs > 0 ? setInterval(tick, intervalMs) : undefined;

async function shutdown() {
  clearInterval(timer);
  await app.close();
  await db.end();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: config.API_PORT, host: 'localhost' });
if (intervalMs > 0) void tick();
