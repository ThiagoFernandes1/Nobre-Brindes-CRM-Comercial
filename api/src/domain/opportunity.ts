import type { IsoDate } from '../lib/dates.js';
import type { Stage } from './stages.js';
import type { StageSubject } from './transitions.js';

export interface OpportunityItem {
  id: number;
  description: string;
  quantity: number;
}

export interface Opportunity {
  id: number;
  code: string;
  companyName: string;
  seller: { id: number; name: string };
  estimatedValue: number | null;
  stage: Stage;
  leadReceivedOn: IsoDate;
  lastContactAt: IsoDate | null;
  requestedFollowUpAt: IsoDate | null;
  proposalValidUntil: IsoDate | null;
  eventDate: IsoDate | null;
  lossReason: string | null;
  notes: string | null;
  items: OpportunityItem[];
  stageChangedAt: string;
  createdAt: string;
  updatedAt: string;
}

export function toStageSubject(opportunity: Opportunity): StageSubject {
  return {
    stage: opportunity.stage,
    estimatedValue: opportunity.estimatedValue,
    itemCount: opportunity.items.length,
    proposalValidUntil: opportunity.proposalValidUntil,
  };
}
