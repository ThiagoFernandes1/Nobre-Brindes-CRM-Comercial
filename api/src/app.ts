import { timingSafeEqual } from 'node:crypto';
import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Notifier } from './automation/notifier.js';
import type { Db } from './db/pool.js';
import { AppError } from './http/errors.js';
import type { IsoDate } from './lib/dates.js';
import { registerRoutes } from './routes/index.js';

export interface AppDeps {
  db: Db;
  today: () => IsoDate;
  notifier: Notifier;
  apiKey?: string;
  corsOrigin?: string;
  logger?: boolean;
}

// not null, foreign key e check do Postgres
const PG_CONSTRAINT_ERRORS = new Set(['23502', '23503', '23514']);

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: deps.logger ?? false, bodyLimit: 100_000 });

  if (deps.corsOrigin) {
    await app.register(cors, { origin: deps.corsOrigin.split(',').map((o) => o.trim()) });
  }

  if (deps.apiKey) {
    const apiKey = deps.apiKey;
    app.addHook('onRequest', async (request) => {
      if (request.url === '/health') return;
      const provided = request.headers['x-api-key'];
      if (typeof provided !== 'string' || !safeEqual(provided, apiKey)) {
        throw new AppError(401, 'UNAUTHORIZED', 'Chave de API ausente ou inválida.');
      }
    });
  }

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details },
      });
    }
    const err = error as { code?: string; statusCode?: number; message?: string };
    if (err.code && PG_CONSTRAINT_ERRORS.has(err.code)) {
      request.log.warn({ err: error }, 'violação de constraint');
      return reply.status(422).send({
        error: { code: 'CONSTRAINT_VIOLATION', message: 'Os dados enviados violam uma regra de consistência.' },
      });
    }
    if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
      return reply.status(err.statusCode).send({ error: { code: 'BAD_REQUEST', message: err.message } });
    }
    request.log.error({ err: error }, 'erro inesperado');
    return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Erro inesperado. Tente novamente.' } });
  });

  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({ error: { code: 'ROUTE_NOT_FOUND', message: `Rota ${request.method} ${request.url} não existe.` } }),
  );

  await registerRoutes(app, deps);
  return app;
}
