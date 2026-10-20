// mesmos tipos da API, mantidos à mão

export type Stage =
  | 'PRIMEIRO_CONTATO'
  | 'APRESENTACAO_ORCAMENTO'
  | 'FOLLOW_UP'
  | 'FORECAST'
  | 'FECHAMENTO'
  | 'PERDIDA';

export type Severity = 'CRITICAL' | 'WARNING';

export interface AttentionFlag {
  code: string;
  severity: Severity;
  message: string;
}

export interface NextFollowUp {
  dueDate: string;
  reason: string;
  title: string;
  daysLate: number;
}

export interface Attention {
  level: Severity | 'OK';
  flags: AttentionFlag[];
  score: number;
  nextFollowUp: NextFollowUp | null;
}

export interface OpportunityItem {
  id: number;
  description: string;
  quantity: number;
}

export interface Seller {
  id: number;
  name: string;
}

export interface Opportunity {
  id: number;
  code: string;
  companyName: string;
  seller: Seller;
  estimatedValue: number | null;
  stage: Stage;
  leadReceivedOn: string;
  lastContactAt: string | null;
  requestedFollowUpAt: string | null;
  proposalValidUntil: string | null;
  eventDate: string | null;
  lossReason: string | null;
  notes: string | null;
  items: OpportunityItem[];
  stageChangedAt: string;
  updatedAt: string;
  attention: Attention;
}

export interface StageHistoryEntry {
  id: number;
  fromStage: Stage | null;
  toStage: Stage;
  kind: 'CREATED' | 'ADVANCE' | 'RETURN' | 'LOSS';
  reason: string | null;
  changedBy: string | null;
  changedAt: string;
}

export type ContactChannel = 'PHONE' | 'WHATSAPP' | 'EMAIL' | 'MEETING';

export interface Contact {
  id: number;
  contactedOn: string;
  channel: ContactChannel;
  summary: string;
  nextFollowUpAt: string | null;
  recordedBy: string | null;
}

export interface OpportunityDetail extends Opportunity {
  history: StageHistoryEntry[];
  contacts: Contact[];
}

export interface StageMeta {
  id: Stage;
  label: string;
  final: boolean;
  inPipeline: boolean;
}

export interface Meta {
  today: string;
  stages: StageMeta[];
  allowedReturns: Partial<Record<Stage, Stage[]>>;
  followUpCadenceDays: Record<string, number>;
  productionLeadDays: number;
}

export interface AgendaEntry {
  id: number;
  dueDate: string;
  reason: string;
  title: string;
  bucket: 'OVERDUE' | 'TODAY' | 'UPCOMING';
  daysLate: number;
  opportunity: {
    id: number;
    code: string;
    companyName: string;
    stage: Stage;
    estimatedValue: number | null;
    seller: Seller;
  };
}

export interface OpportunityFilters {
  search: string;
  sellerId: number | null;
  needsAttention: boolean;
}

export interface MissingRequirement {
  code: string;
  message: string;
}
