-- Estrutura inicial do CRM da Nobre Brindes.
-- As regras de etapa vivem no domínio da API; as constraints abaixo são a última linha de defesa
-- (nenhum script, migração ou acesso direto ao banco deixa um dado impossível entrar).

CREATE TYPE opportunity_stage AS ENUM (
  'PRIMEIRO_CONTATO',
  'APRESENTACAO_ORCAMENTO',
  'FOLLOW_UP',
  'FORECAST',
  'FECHAMENTO',
  'PERDIDA'
);

CREATE TABLE sellers (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE CHECK (length(trim(name)) > 0)
);

CREATE SEQUENCE opportunity_code_seq START 2001;

CREATE TABLE opportunities (
  id                   SERIAL PRIMARY KEY,
  code                 TEXT NOT NULL UNIQUE DEFAULT ('OPP-' || nextval('opportunity_code_seq')),
  company_name         TEXT NOT NULL CHECK (length(trim(company_name)) > 0),
  seller_id            INT NOT NULL REFERENCES sellers (id),
  estimated_value      NUMERIC(12, 2) CHECK (estimated_value > 0),
  stage                opportunity_stage NOT NULL DEFAULT 'PRIMEIRO_CONTATO',
  lead_received_on     DATE NOT NULL,          -- base do SLA de primeiro contato
  last_contact_at      DATE,
  requested_follow_up_at DATE,                 -- retorno combinado com o cliente no último contato
  proposal_valid_until DATE,
  event_date           DATE,
  loss_reason          TEXT,
  notes                TEXT,
  stage_changed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT loss_reason_required
    CHECK (stage <> 'PERDIDA' OR length(trim(coalesce(loss_reason, ''))) > 0),
  CONSTRAINT value_required_from_quote
    CHECK (stage IN ('PRIMEIRO_CONTATO', 'PERDIDA') OR estimated_value IS NOT NULL)
);

CREATE INDEX opportunities_stage_idx ON opportunities (stage);
CREATE INDEX opportunities_seller_idx ON opportunities (seller_id);

CREATE TABLE opportunity_items (
  id             SERIAL PRIMARY KEY,
  opportunity_id INT NOT NULL REFERENCES opportunities (id) ON DELETE CASCADE,
  description    TEXT NOT NULL CHECK (length(trim(description)) > 0),
  quantity       INT NOT NULL CHECK (quantity > 0),
  position       SMALLINT NOT NULL DEFAULT 0
);

CREATE INDEX opportunity_items_opportunity_idx ON opportunity_items (opportunity_id);

-- Histórico de etapas: quando, de onde, para onde, por quê e por quem. Só recebe INSERT.
CREATE TABLE stage_history (
  id             BIGSERIAL PRIMARY KEY,
  opportunity_id INT NOT NULL REFERENCES opportunities (id) ON DELETE CASCADE,
  from_stage     opportunity_stage,           -- NULL = criação / carga inicial
  to_stage       opportunity_stage NOT NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('CREATED', 'ADVANCE', 'RETURN', 'LOSS')),
  reason         TEXT,
  changed_by     TEXT,
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX stage_history_opportunity_idx ON stage_history (opportunity_id, changed_at);

CREATE TABLE contacts (
  id                BIGSERIAL PRIMARY KEY,
  opportunity_id    INT NOT NULL REFERENCES opportunities (id) ON DELETE CASCADE,
  contacted_on      DATE NOT NULL,
  channel           TEXT NOT NULL CHECK (channel IN ('PHONE', 'WHATSAPP', 'EMAIL', 'MEETING')),
  summary           TEXT NOT NULL CHECK (length(trim(summary)) > 0),
  next_follow_up_at DATE,
  recorded_by       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX contacts_opportunity_idx ON contacts (opportunity_id, contacted_on);

-- Automação de follow-up: cada oportunidade aberta tem exatamente um "próximo retorno" em aberto.
CREATE TABLE follow_up_tasks (
  id                    BIGSERIAL PRIMARY KEY,
  opportunity_id        INT NOT NULL REFERENCES opportunities (id) ON DELETE CASCADE,
  due_date              DATE NOT NULL,
  reason                TEXT NOT NULL,
  title                 TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'DONE', 'CANCELED')),
  closed_by_contact_id  BIGINT REFERENCES contacts (id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at             TIMESTAMPTZ
);

CREATE UNIQUE INDEX follow_up_tasks_one_open_per_opportunity
  ON follow_up_tasks (opportunity_id) WHERE status = 'OPEN';
CREATE INDEX follow_up_tasks_open_due_idx ON follow_up_tasks (due_date) WHERE status = 'OPEN';

-- Resumo diário enviado a cada vendedor (garante no máximo um envio por dia, mesmo com o job rodando várias vezes).
CREATE TABLE follow_up_digests (
  id          BIGSERIAL PRIMARY KEY,
  seller_id   INT NOT NULL REFERENCES sellers (id),
  digest_date DATE NOT NULL,
  payload     JSONB NOT NULL,
  delivered_via TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (seller_id, digest_date)
);
