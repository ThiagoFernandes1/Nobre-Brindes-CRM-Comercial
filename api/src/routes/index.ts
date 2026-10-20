import type { FastifyInstance, FastifyRequest } from 'fastify';
import { runFollowUpJob } from '../automation/follow-up-job.js';
import { FOLLOW_UP_CADENCE_DAYS, PRODUCTION_LEAD_DAYS } from '../domain/follow-up.js';
import { ALLOWED_RETURNS, FINAL_STAGES, PIPELINE, STAGE_LABELS, STAGES } from '../domain/stages.js';
import {
  agendaQuery,
  changeStageBody,
  createOpportunityBody,
  idParams,
  listOpportunitiesQuery,
  parse,
  registerContactBody,
  updateOpportunityBody,
} from '../http/schemas.js';
import { findSellers } from '../repositories/activity.js';
import type { AppDeps } from '../app.js';
import { getAgenda } from '../services/follow-ups.js';
import {
  changeStage,
  createOpportunity,
  getOpportunityDetail,
  listOpportunities,
  registerContact,
  updateOpportunity,
  type Actor,
} from '../services/opportunities.js';

/** Nome de quem está agindo, só para auditoria. Não é autenticação (ver README > Segurança). */
function actorOf(request: FastifyRequest): Actor {
  const raw = request.headers['x-user-name'];
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  try {
    return decodeURIComponent(raw).trim().slice(0, 60);
  } catch {
    return null;
  }
}

export async function registerRoutes(app: FastifyInstance, deps: AppDeps) {
  const { db, today, notifier } = deps;

  app.get('/health', async () => {
    await db.query('SELECT 1');
    return { status: 'ok' };
  });

  app.get('/meta', async () => ({
    today: today(),
    stages: STAGES.map((id) => ({
      id,
      label: STAGE_LABELS[id],
      final: FINAL_STAGES.includes(id),
      inPipeline: (PIPELINE as readonly string[]).includes(id),
    })),
    allowedReturns: ALLOWED_RETURNS,
    followUpCadenceDays: FOLLOW_UP_CADENCE_DAYS,
    productionLeadDays: PRODUCTION_LEAD_DAYS,
  }));

  app.get('/sellers', async () => findSellers(db));

  app.get('/opportunities', async (request) => {
    const query = parse(listOpportunitiesQuery, request.query);
    return listOpportunities(db, query, today());
  });

  app.get('/opportunities/:id', async (request) => {
    const { id } = parse(idParams, request.params);
    return getOpportunityDetail(db, id, today());
  });

  app.post('/opportunities', async (request, reply) => {
    const body = parse(createOpportunityBody, request.body);
    const created = await createOpportunity(db, body, actorOf(request), today());
    return reply.status(201).send(created);
  });

  app.patch('/opportunities/:id', async (request) => {
    const { id } = parse(idParams, request.params);
    const body = parse(updateOpportunityBody, request.body);
    return updateOpportunity(db, id, body, today());
  });

  app.post('/opportunities/:id/stage-transitions', async (request) => {
    const { id } = parse(idParams, request.params);
    const body = parse(changeStageBody, request.body);
    return changeStage(db, id, body, actorOf(request), today());
  });

  app.post('/opportunities/:id/contacts', async (request, reply) => {
    const { id } = parse(idParams, request.params);
    const body = parse(registerContactBody, request.body);
    const updated = await registerContact(db, id, body, actorOf(request), today());
    return reply.status(201).send(updated);
  });

  app.get('/follow-ups/agenda', async (request) => {
    const { sellerId } = parse(agendaQuery, request.query);
    return getAgenda(db, today(), sellerId);
  });

  // Disparo manual do job (útil em dev e para um agendador externo em produção).
  app.post('/follow-ups/run', async () => runFollowUpJob(db, notifier, today()));
}
