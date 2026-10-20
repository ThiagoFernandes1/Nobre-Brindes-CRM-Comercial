import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// mesmo .env da raiz que o docker-compose usa
dotenv.config({ path: path.resolve(import.meta.dirname, '../../.env'), quiet: true });

const optionalString = z
  .string()
  .optional()
  .transform((value) => (value && value.trim() !== '' ? value.trim() : undefined));

const schema = z.object({
  API_PORT: z.coerce.number().int().positive().default(3333),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL não definida (veja .env.example)'),
  DATABASE_URL_TEST: optionalString,
  REFERENCE_DATE: optionalString.pipe(z.iso.date().optional()),
  API_KEY: optionalString,
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  FOLLOW_UP_JOB_INTERVAL_MINUTES: z.coerce.number().min(0).default(15),
  FOLLOW_UP_WEBHOOK_URL: optionalString.pipe(z.url().optional()),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Configuração inválida:', z.prettifyError(parsed.error));
  process.exit(1);
}

export const config = parsed.data;
