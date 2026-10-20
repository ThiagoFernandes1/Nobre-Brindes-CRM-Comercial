import { z } from 'zod';
import { STAGES } from '../domain/stages.js';
import { CONTACT_CHANNELS } from '../repositories/activity.js';
import { AppError } from './errors.js';

const isoDate = z.iso.date({ error: 'Data inválida (use AAAA-MM-DD).' });
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value ? value : null));

export const idParams = z.object({ id: z.coerce.number().int().positive() });

const item = z.object({
  description: z.string().trim().min(1, 'Descreva o item de brinde.').max(200),
  quantity: z.number().int().positive('A quantidade deve ser maior que zero.').max(1_000_000),
});

const opportunityFields = {
  companyName: z.string().trim().min(1, 'Informe a empresa.').max(200),
  sellerId: z.number().int().positive(),
  estimatedValue: z.number().positive('O valor estimado deve ser maior que zero.').max(10_000_000_000).nullable(),
  proposalValidUntil: isoDate.nullable(),
  eventDate: isoDate.nullable(),
  notes: optionalText(2000),
  items: z.array(item).max(50),
};

export const createOpportunityBody = z.object({
  ...opportunityFields,
  estimatedValue: opportunityFields.estimatedValue.default(null),
  proposalValidUntil: opportunityFields.proposalValidUntil.default(null),
  eventDate: opportunityFields.eventDate.default(null),
  notes: opportunityFields.notes.default(null),
  items: opportunityFields.items.default([]),
});

export const updateOpportunityBody = z.strictObject(opportunityFields).partial();

export const listOpportunitiesQuery = z.object({
  search: z.string().trim().max(100).optional(),
  sellerId: z.coerce.number().int().positive().optional(),
  stage: z.enum(STAGES).optional(),
  needsAttention: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export const changeStageBody = z.object({
  toStage: z.enum(STAGES, { error: 'Etapa de destino inválida.' }),
  expectedFromStage: z.enum(STAGES).optional(),
  reason: z.string().trim().max(500).nullish(),
});

export const registerContactBody = z.object({
  channel: z.enum(CONTACT_CHANNELS),
  summary: z.string().trim().min(3, 'Resuma o que foi conversado.').max(2000),
  contactedOn: isoDate.optional(),
  nextFollowUpAt: isoDate.nullish(),
});

export const agendaQuery = z.object({
  sellerId: z.coerce.number().int().positive().optional(),
});

export function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Dados inválidos.', {
      issues: result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }
  return result.data;
}
