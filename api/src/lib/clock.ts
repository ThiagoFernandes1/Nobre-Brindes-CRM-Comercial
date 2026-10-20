import { config } from '../config.js';
import { todayIn, type IsoDate } from './dates.js';

export const BUSINESS_TIME_ZONE = 'America/Sao_Paulo';

/**
 * "Hoje" para as regras de negócio. REFERENCE_DATE permite reproduzir o cenário do case (15/10/2026);
 * em produção fica vazio e vale a data real no fuso de São Paulo.
 */
export function today(): IsoDate {
  return config.REFERENCE_DATE ?? todayIn(BUSINESS_TIME_ZONE);
}
