import type {
  AgendaEntry,
  ContactChannel,
  Meta,
  Opportunity,
  OpportunityDetail,
  OpportunityFilters,
  Seller,
  Stage,
} from './types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: { missing?: { code: string; message: string }[]; issues?: { path: string; message: string }[] },
  ) {
    super(message);
  }
}

let actorName: string | null = null;

/** Nome de quem está usando a tela, enviado só para registro no histórico (não é autenticação). */
export function setActorName(name: string | null) {
  actorName = name;
}

async function request<T>(path: string, options: { method?: string; json?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.json !== undefined) headers['content-type'] = 'application/json';
  if (actorName) headers['x-user-name'] = encodeURIComponent(actorName);

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.json !== undefined ? JSON.stringify(options.json) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Sem conexão com o servidor. Verifique sua rede e tente novamente.');
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      body?.error?.code ?? 'UNKNOWN_ERROR',
      body?.error?.message ?? `Erro inesperado (${response.status}).`,
      body?.error?.details,
    );
  }
  return body as T;
}

export interface OpportunityInput {
  companyName: string;
  sellerId: number;
  estimatedValue: number | null;
  proposalValidUntil: string | null;
  eventDate: string | null;
  notes: string | null;
  items: { description: string; quantity: number }[];
}

export const api = {
  meta: () => request<Meta>('/meta'),
  sellers: () => request<Seller[]>('/sellers'),

  listOpportunities(filters: OpportunityFilters) {
    const params = new URLSearchParams();
    if (filters.search) params.set('search', filters.search);
    if (filters.sellerId) params.set('sellerId', String(filters.sellerId));
    if (filters.needsAttention) params.set('needsAttention', 'true');
    const query = params.toString();
    return request<Opportunity[]>(`/opportunities${query ? `?${query}` : ''}`);
  },

  getOpportunity: (id: number) => request<OpportunityDetail>(`/opportunities/${id}`),

  createOpportunity: (input: OpportunityInput) =>
    request<Opportunity>('/opportunities', { method: 'POST', json: input }),

  updateOpportunity: (id: number, input: Partial<OpportunityInput>) =>
    request<Opportunity>(`/opportunities/${id}`, { method: 'PATCH', json: input }),

  changeStage: (id: number, body: { toStage: Stage; expectedFromStage: Stage; reason?: string }) =>
    request<Opportunity>(`/opportunities/${id}/stage-transitions`, { method: 'POST', json: body }),

  registerContact: (
    id: number,
    body: { channel: ContactChannel; summary: string; nextFollowUpAt?: string | null },
  ) => request<Opportunity>(`/opportunities/${id}/contacts`, { method: 'POST', json: body }),

  agenda: (sellerId: number | null) =>
    request<AgendaEntry[]>(`/follow-ups/agenda${sellerId ? `?sellerId=${sellerId}` : ''}`),
};
