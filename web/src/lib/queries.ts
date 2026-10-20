'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type OpportunityInput } from './api';
import type { ContactChannel, Opportunity, OpportunityFilters, Stage } from './types';

export const queryKeys = {
  meta: ['meta'] as const,
  sellers: ['sellers'] as const,
  opportunities: (filters?: OpportunityFilters) =>
    filters ? (['opportunities', filters] as const) : (['opportunities'] as const),
  opportunity: (id: number) => ['opportunity', id] as const,
  agenda: (sellerId?: number | null) => (sellerId === undefined ? ['agenda'] : ['agenda', sellerId]) as readonly unknown[],
};

export function useMeta() {
  return useQuery({ queryKey: queryKeys.meta, queryFn: api.meta, staleTime: 5 * 60_000 });
}

export function useSellers() {
  return useQuery({ queryKey: queryKeys.sellers, queryFn: api.sellers, staleTime: 5 * 60_000 });
}

export function useOpportunities(filters: OpportunityFilters) {
  return useQuery({
    queryKey: queryKeys.opportunities(filters),
    queryFn: () => api.listOpportunities(filters),
    // mantém os dados anteriores enquanto busca
    placeholderData: keepPreviousData,
  });
}

export function useOpportunityDetail(id: number | null) {
  return useQuery({
    queryKey: queryKeys.opportunity(id ?? 0),
    queryFn: () => api.getOpportunity(id!),
    enabled: id !== null,
  });
}

export function useAgenda(sellerId: number | null) {
  return useQuery({ queryKey: queryKeys.agenda(sellerId), queryFn: () => api.agenda(sellerId) });
}

function useInvalidateOpportunity() {
  const queryClient = useQueryClient();
  return (id: number) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunity(id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.agenda() }),
    ]);
}

export interface ChangeStageVariables {
  id: number;
  from: Stage;
  to: Stage;
  reason?: string;
  /** false quando já se sabe que a API vai recusar */
  optimistic?: boolean;
}

export function useChangeStage() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateOpportunity();
  return useMutation({
    mutationFn: ({ id, from, to, reason }: ChangeStageVariables) =>
      api.changeStage(id, { toStage: to, expectedFromStage: from, reason }),
    onMutate: async ({ id, to, optimistic = true }) => {
      if (!optimistic) return { snapshots: [] };
      await queryClient.cancelQueries({ queryKey: queryKeys.opportunities() });
      const snapshots = queryClient.getQueriesData<Opportunity[]>({ queryKey: queryKeys.opportunities() });
      queryClient.setQueriesData<Opportunity[]>({ queryKey: queryKeys.opportunities() }, (list) =>
        list?.map((o) => (o.id === id ? { ...o, stage: to } : o)),
      );
      return { snapshots };
    },
    onError: (_error, _variables, context) => {
      context?.snapshots.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
    onSettled: (_data, _error, { id }) => invalidate(id),
  });
}

export function useUpdateOpportunity(id: number) {
  const invalidate = useInvalidateOpportunity();
  return useMutation({
    mutationFn: (input: Partial<OpportunityInput>) => api.updateOpportunity(id, input),
    onSuccess: () => invalidate(id),
  });
}

export function useCreateOpportunity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: OpportunityInput) => api.createOpportunity(input),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.opportunities() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.agenda() }),
      ]),
  });
}

export function useRegisterContact(id: number) {
  const invalidate = useInvalidateOpportunity();
  return useMutation({
    mutationFn: (body: { channel: ContactChannel; summary: string; nextFollowUpAt?: string | null }) =>
      api.registerContact(id, body),
    onSuccess: () => invalidate(id),
  });
}
