import { config } from '../config.js';
import { todayIn, type IsoDate } from './dates.js';

export const BUSINESS_TIME_ZONE = 'America/Sao_Paulo';

// REFERENCE_DATE fixa o "hoje" (o case usa 15/10/2026)
export function today(): IsoDate {
  return config.REFERENCE_DATE ?? todayIn(BUSINESS_TIME_ZONE);
}
