# CRM Nobre Brindes

Primeira versão de um CRM interno para o time comercial da **Nobre Brindes**. Ele acompanha oportunidades, move as oportunidades pelo funil e mostra **quais negociações precisam de atenção hoje**, antes que a venda se perca.

![Funil](docs/funil.png)

| Detalhe da oportunidade | Agenda de retornos (automação) |
| --- | --- |
| ![Detalhe](docs/detalhe.png) | ![Retornos](docs/retornos.png) |

**Sumário**
[Como rodar](#como-rodar) · [Arquitetura](#arquitetura) · [Regras do funil](#regras-do-funil) · [Consistência](#consistência-dos-dados) · [O que exige atenção](#o-que-exige-atenção) · [Automação](#automação-escolhida-problema-4--retornos-de-follow-up) · [Outros problemas](#os-outros-três-problemas) · [Segurança](#segurança) · [Testes](#testes) · [Dados do case](#dados-do-case-e-lacunas) · [Limitações](#limitações-e-próximos-passos) · [Uso de IA](#uso-de-ia)

---

## Como rodar

**Pré-requisitos:** Node.js 20 ou superior (testado com 24) e Docker Desktop.

```bash
cp .env.example .env                 # ajuste POSTGRES_PASSWORD e a senha dentro de DATABASE_URL*
cp web/.env.example web/.env.local
npm run setup                        # instala as dependências de api/ e web/
npm run db:up                        # sobe o PostgreSQL 16 (porta 5433) e cria também o banco de testes
npm run db:reset                     # cria as tabelas e carrega os 7 registros do case
npm run dev:api                      # terminal 1: API em http://localhost:3333
npm run dev:web                      # terminal 2: interface em http://localhost:3000
```

> No PowerShell, use `copy` no lugar de `cp`.

| Comando | O que faz |
| --- | --- |
| `npm test` | Testes unitários e de integração da API. Os de integração usam o banco `nobre_crm_test` e são pulados se `DATABASE_URL_TEST` não estiver definida. |
| `npm run lint` | Typecheck da API e ESLint do front |
| `npm run job:follow-ups` | Executa uma vez o job de follow-up, para ser chamado por um agendador externo |
| `npm run db:reset` | Recria o schema e recarrega os dados do case |

**Data de referência.** Os dados fictícios são de 15/10/2026, por isso `.env.example` traz `REFERENCE_DATE=2026-10-15`. Todas as regras de atenção e follow-up usam esse "hoje", que aparece no cabeçalho da interface. Para usar a data real (fuso America/Sao_Paulo), deixe a variável vazia.

---

## Arquitetura

```
nobre-crm/
├── api/                       Node.js + TypeScript + Fastify + PostgreSQL (SQL puro)
│   ├── src/domain/            regras de negócio PURAS: etapas, transições, follow-up, atenção
│   ├── src/services/          casos de uso: transação, lock, regra, histórico e replanejamento do retorno
│   ├── src/repositories/      SQL parametrizado, sem regra de negócio
│   ├── src/automation/        job de follow-up, resumo diário e notificadores (log ou webhook)
│   ├── src/http/ + routes/    validação de entrada (zod) e rotas finas
│   ├── src/db/                pool, migrations versionadas (.sql) e carga inicial
│   └── test/unit|integration
├── web/                       Next.js 16 + React 19 + TypeScript + Tailwind 4 + TanStack Query
│   ├── src/app/api/[...path]  proxy BFF: repassa /api/* para a API, adicionando a API key no servidor
│   ├── src/components/board   Kanban (colunas, card, arrastar, fluxo de mudança de etapa)
│   ├── src/components/opportunity  detalhe, edição, registro de contato
│   └── src/components/agenda  agenda de retornos
├── infra/                     script que cria o banco de testes
└── docker-compose.yml
```

**Por que assim:**

- **Regras no domínio puro.** `api/src/domain` não conhece banco nem HTTP. Toda regra que decide uma venda (pode mover? está atrasado? quando é o próximo retorno?) é uma função testável em milissegundos, com os casos do próprio enunciado como teste.
- **SQL puro em vez de ORM.** São poucas tabelas, e eu queria controle explícito de transação, `SELECT ... FOR UPDATE` e constraints. Um ORM esconderia exatamente o que garante a consistência.
- **API separada do Next.** O case pede uma API REST em Node, e a separação deixa a regra num lugar só, seja quem for o cliente: tela, automação, integração futura com site ou WhatsApp.
- **Proxy BFF no Next.** O navegador só chama `/api/*` do próprio Next. O servidor do Next repassa à API com a chave. Assim a credencial nunca chega ao JavaScript do cliente e não há CORS para configurar.

### Endpoints

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/opportunities?search=&sellerId=&stage=&needsAttention=true` | Lista com atenção calculada, mais urgentes primeiro |
| GET | `/opportunities/:id` | Detalhe com histórico de etapas e contatos |
| POST | `/opportunities` | Cria (sempre em Primeiro Contato) |
| PATCH | `/opportunities/:id` | Edita dados e itens, respeitando os requisitos da etapa atual |
| POST | `/opportunities/:id/stage-transitions` | `{ toStage, expectedFromStage?, reason? }`, a única forma de mudar etapa |
| POST | `/opportunities/:id/contacts` | Registra contato, conclui o retorno e agenda o próximo |
| GET | `/follow-ups/agenda?sellerId=` | Retornos atrasados, de hoje e dos próximos 7 dias |
| POST | `/follow-ups/run` | Dispara o job de follow-up manualmente |
| GET | `/meta`, `/sellers`, `/health` | Etapas e transições permitidas, vendedores, saúde |

Os erros seguem sempre o formato `{ "error": { "code", "message", "details" } }`, com códigos estáveis como `STAGE_SKIP_NOT_ALLOWED`, `REQUIREMENTS_NOT_MET` e `STALE_STAGE`. A mensagem já vem em português para ser mostrada ao vendedor.

---

## Regras do funil

`Primeiro Contato → Apresentação de Orçamento → Follow-up → Forecast → Fechamento`, além de **Perdida** como saída lateral. Fechamento e Perdida são finais.

### Avanço

| Movimento | Exige | Origem |
| --- | --- | --- |
| Primeiro Contato → Apresentação de Orçamento | valor estimado > 0 **e** ≥ 1 item de brinde | enunciado |
| Apresentação de Orçamento → Follow-up | validade da proposta preenchida | **decisão minha** |
| Follow-up → Forecast | os requisitos anteriores (são cumulativos) | |
| Forecast → Fechamento | só a partir de Forecast; proposta **não vencida** | enunciado + **decisão minha** |
| Qualquer etapa aberta → Perdida | motivo da perda | enunciado |

As decisões que tomei:

- **Avanço é sempre uma etapa por vez.** Cada etapa representa algo que precisa acontecer (orçar, cobrar, prever). Pular etapa significaria pular a validação dela. O custo é um clique a mais num caso raro.
- **Follow-up exige validade da proposta.** Follow-up significa "proposta enviada, aguardando resposta". Sem validade, não há prazo para cobrar nem para alertar. Isso explica a lacuna do OPP-2001: está em Primeiro Contato e ainda não tem proposta, o que é coerente.
- **Não se fecha com proposta vencida.** Brinde personalizado tem custo que varia. Fechar sobre um preço vencido compromete margem. A saída é renovar a validade com o cliente (editar) ou voltar para Apresentação de Orçamento.
- **Os requisitos valem também na edição.** Não é possível apagar o valor ou o último item de uma oportunidade em Follow-up, por exemplo. A regra não pode ser burlada "editando depois de mover".

### Retornos de etapa

| Retorno | Permitido? | Por quê |
| --- | --- | --- |
| Follow-up → Apresentação de Orçamento | ✅ com motivo | O cliente pediu revisão (quantidade, item, preço). Nasce uma nova proposta. |
| Forecast → Follow-up | ✅ com motivo | O cliente esfriou ou adiou a decisão. Volta a ser cobrado na cadência de Follow-up. |
| Forecast → Apresentação de Orçamento | ✅ com motivo | Renegociação que muda o escopo e exige proposta nova. |
| Qualquer → Primeiro Contato | ❌ | O contato já aconteceu. Voltar distorceria o SLA de primeiro contato e o histórico. Lead que sumiu fica com alerta de retorno ou vira Perdida. |
| Fechamento / Perdida → qualquer | ❌ | Estados finais. Reabrir distorce a taxa de conversão. Uma nova negociação com o mesmo cliente vira **nova oportunidade**, e o histórico da anterior fica preservado. |

Todo retorno exige motivo, que vai para o histórico. Retorno é informação valiosa sobre o funil ("por que tantas propostas voltam para revisão?").

A matriz de retornos vive em [`api/src/domain/stages.ts`](api/src/domain/stages.ts) e é publicada em `GET /meta`. O front a usa apenas para **orientar** o arrastar (destacar colunas válidas, pedir motivo). Quem decide é sempre a API.

---

## Consistência dos dados

1. **Validação no backend.** A tela nunca é a fonte da regra: um `curl` direto recebe a mesma recusa (`422` com o código e os requisitos faltantes).
2. **Constraints no banco como última linha de defesa.** `Perdida` sem motivo, valor ausente a partir do orçamento e mais de um retorno aberto por oportunidade são recusados pelo próprio PostgreSQL. Isso vale mesmo para um script ou acesso direto (há teste disso).
3. **Transação com lock de linha.** A mudança de etapa trava a oportunidade (`FOR UPDATE`), valida, grava a etapa, grava o histórico e replaneja o retorno, tudo ou nada.
4. **Tela desatualizada não sobrescreve.** O front envia `expectedFromStage`. Se outra pessoa já moveu o card, a API responde `409 STALE_STAGE` em vez de aplicar uma mudança pensada sobre um estado antigo. O teste dispara duas mudanças simultâneas e confirma que só uma vence.
5. **Histórico de etapas só recebe INSERT:** quando, de onde, para onde, tipo (avanço, retorno, perda), motivo e quem.

---

## O que exige atenção

A pergunta que o case faz ("o vendedor encontra rápido a negociação que precisa trabalhar hoje?") virou a função [`assessAttention`](api/src/domain/attention.ts). Ela devolve **nível** (crítico, alerta ou em dia), **motivos legíveis** e um **score** para ordenar.

| Sinal | Alerta | Crítico |
| --- | --- | --- |
| Retorno atrasado (ver automação) | 1–2 dias | ≥ 3 dias |
| Lead sem primeiro contato | | já no dia seguinte à entrada |
| Validade da proposta | vence em ≤ 3 dias | vencida |
| Evento do cliente | em ≤ 14 dias | em ≤ 7 dias (prazo de produção) ou já passou |
| Proposta enviada sem validade | Follow-up/Forecast sem data | |

Na interface:

- **Faixa de resumo no topo:** quantas exigem atenção, quantos retornos atrasados, quantos para hoje e valor em negociação. "Ver só essas" filtra o quadro.
- **Card** com borda vermelha ou amarela, o motivo principal escrito ("Retorno atrasado há 7 dias") e o próximo retorno ("hoje", "atrasado 10d").
- Dentro de cada coluna, os cards vêm **ordenados por urgência**.
- **Busca** por empresa, código ou brinde, e filtro por vendedor.
- **Carregamento** com esqueleto, **erro** com mensagem e "Tentar novamente", **vazio** com sugestão de limpar filtros. Quando a API recusa um movimento, o card volta para o lugar e aparece o motivo, com atalho "Completar dados da oportunidade".
- **Acessibilidade:** o arrastar funciona com mouse e toque. Pelo teclado, Enter abre o detalhe, que tem botões "Avançar para…", "Voltar para…" e "Marcar como perdida". Os modais usam `<dialog>` nativo (foco preso, Esc fecha).

Com os dados do case, o quadro abre mostrando três críticas: Construtora Horizonte (retorno atrasado há 7 dias, proposta vencida, evento em 10 dias), Agência Pulso (atrasada há 10 dias, proposta vencida) e Clínica Vida (evento em 3 dias, prazo de produção em risco).

---

## Automação escolhida: problema 4, retornos de follow-up

**Por que esse.** O próprio case diz que "o que decide o resultado é o follow-up: o vendedor que esquece uma proposta na gaveta perde a venda". É o problema que mais conversa com o CRM em si e que se resolve só com os dados que o CRM já tem, sem depender de integração externa para funcionar.

**Como funciona.**

1. **Toda oportunidade aberta tem exatamente um "próximo retorno"** (tabela `follow_up_tasks`, garantido por índice único parcial). [`planFollowUp`](api/src/domain/follow-up.ts) calcula a data e o motivo e escolhe o prazo **mais cedo** entre:
   - cadência da etapa a partir do último contato: Primeiro Contato 1 dia, Orçamento 2, Follow-up 3, Forecast 2;
   - **ou** a data que o cliente pediu ("me liga dia 25"), registrada junto com o contato;
   - véspera do vencimento da proposta;
   - último dia para garantir a produção antes do evento (evento − 7 dias);
   - lead sem nenhum contato: o retorno vence no dia da entrada (SLA de primeiro contato).

   Prazos que caem antes do último contato são ignorados: o vendedor já falou com o cliente depois deles, e a automação não fica cobrando o que já foi tratado.
2. **Registrar um contato conclui o retorno** (status `DONE`, ligado ao contato) e a automação agenda o próximo na mesma transação. Mudar de etapa, editar a validade ou o evento também replaneja na hora. Fechamento ou Perdida **cancela** o retorno pendente.
3. **Um job** ([`follow-up-job.ts`](api/src/automation/follow-up-job.ts)) roda a cada 15 minutos dentro da API (configurável) ou via `npm run job:follow-ups`. Ele:
   - **reconcilia** todos os retornos. É idempotente: rodar duas vezes não muda nada (testado). Também cobre o que os eventos não cobrem, como carga inicial, edição direta no banco ou falhas;
   - envia **um resumo diário por vendedor** com atrasados e retornos de hoje, para o log ou para um **webhook** (Slack, Teams, n8n ou WhatsApp via integrador). No máximo um por vendedor por dia (`UNIQUE (seller_id, digest_date)`). O registro e o envio ficam na mesma transação, então **se o webhook falhar, nada é marcado como enviado** e o próximo ciclo tenta de novo (testado).
4. **Tela "Retornos"**: a agenda do vendedor (Atrasados, Para hoje, Próximos 7 dias), com "Registrar contato" direto na linha.

Exemplo do resumo gerado com os dados do case:

```
Bom dia, Bruno! Seus retornos de 15/10/2026:

ATRASADOS (1)
• OPP-2002 Construtora Horizonte: Apresentar o orçamento ao cliente (atrasado há 7 dias)
```

**Em produção**, eu tiraria o `setInterval` de dentro da API (com várias réplicas, cada uma rodaria o job; a idempotência evita estrago, mas é desperdício) e usaria um agendador externo (Cloud Scheduler, cron do Kubernetes, GitHub Actions) chamando `npm run job:follow-ups`. O resumo iria para as 8h, no canal que o time já usa.

---

## Os outros três problemas

### 1. SLA de primeiro contato

**Como resolveria:** o lead tem que chegar sozinho ao CRM e ter um dono imediatamente. Se ninguém agir em X minutos, o caso sobe para outra pessoa.

**Implementação:**

- Endpoint `POST /leads` (webhook) recebendo site, formulário, WhatsApp Business e e-mail, que cria a oportunidade com `lead_received_at TIMESTAMPTZ`. Hoje a entrada é por dia; para SLA em minutos ela precisa de hora.
- Distribuição automática (round-robin ponderado por carga aberta e disponibilidade do vendedor).
- O planejador atual já tem o motivo `FIRST_CONTACT_SLA`. Faltaria um job de 1 em 1 minuto que notifica o dono em tempo real (push ou WhatsApp) e, após por exemplo 15 minutos sem contato registrado, **reatribui** ou avisa o gestor.
- Resposta automática imediata ao lead ("recebemos, a Ana vai falar com você em até 15 minutos") para segurar a expectativa.
- Métrica no painel: tempo até o primeiro contato (mediana e p90) por vendedor e por canal.

### 2. Conhecer a empresa do lead

**Como resolveria:** quando o lead entra, uma "ficha da empresa" já deve estar pronta antes da primeira ligação.

**Implementação:**

- Com o CNPJ ou o domínio do e-mail, um job assíncrono (fila no próprio Postgres, como `pg-boss`) consulta fontes públicas: BrasilAPI ou Receita (razão social, porte, CNAE, endereço, data de abertura) e o site da empresa.
- Um LLM resume tudo numa ficha curta: segmento, porte, datas comemorativas típicas do setor, **sugestões de brindes que funcionam para aquele perfil** e perguntas para a ligação.
- Cruzamento com o histórico do grupo: a empresa já comprou da Nobre Brindes ou da Coroa de Flores Nobre? Isso é ouro para o vendedor.
- Armazenamento em `company_profiles` (JSONB, com data de coleta e fontes), exibido no detalhe da oportunidade. Cache por CNPJ, cuidado com LGPD (apenas dados de pessoa jurídica e públicos).

### 3. Informações do roteiro da ligação

**Como resolveria:** o que o cliente fala na ligação precisa virar **campo estruturado**, não texto solto esquecido numa anotação.

**Implementação:**

- **Etapa 1 (simples, de valor imediato):** o roteiro vira um formulário guiado dentro do "Registrar contato": quantidade, orçamento, data do evento, público, quem decide, concorrentes. As respostas **preenchem a oportunidade** (valor, itens, evento), que é exatamente o que libera o avanço de etapa.
- **Etapa 2:** gravação da ligação (com consentimento), transcrição (Whisper) e extração dos campos do roteiro por LLM com saída estruturada. O vendedor **revisa e confirma** antes de salvar, porque a IA sugere e a pessoa decide. A transcrição fica pesquisável (full-text do Postgres) no histórico de contatos.

---

## Segurança

**O que já está implementado:**

- Nenhuma credencial no repositório: `.env` está no `.gitignore` e só `.env.example` é versionado.
- `API_KEY` opcional exigida em toda rota exceto `/health`, com comparação em tempo constante. A chave fica só no servidor do Next (proxy BFF) e nunca vai para o navegador.
- Validação de toda entrada com zod, SQL 100% parametrizado (inclusive escapando `%`/`_` da busca), limite de tamanho do corpo e CORS restrito.
- Erros internos não vazam detalhes (SQL e stack ficam no log; o cliente recebe uma mensagem genérica).

**O que eu faria em produção:**

- **Autenticação no front** com SSO corporativo (OIDC: Google Workspace ou Microsoft Entra) no Next. O servidor do Next repassaria à API um **JWT** do usuário, que a API valida (assinatura, audiência, expiração).
- **Autorização por papel:** vendedor vê e edita as próprias oportunidades, gestor vê todas. O autor do histórico passaria a vir do token. Hoje ele vem do header informativo `x-user-name`, que **não é autenticação**.
- **API sem exposição pública:** rede privada, aceitando apenas o BFF (mTLS ou chave rotacionada via secret manager).
- Rate limiting, headers de segurança (CSP, HSTS), TLS no Postgres, usuário de banco com privilégios mínimos (a aplicação não roda DDL; migrations usam outro usuário), backups e logs de auditoria centralizados.
- Dependências: `npm audit` e Dependabot no CI.

---

## Testes

```
api/test/unit/transitions.test.ts   todas as regras de etapa, incluindo as do enunciado, caso a caso
api/test/unit/attention.test.ts     limiares de atenção e o cenário do case (OPP-2001 a 2005)
api/test/unit/follow-up.test.ts     planejamento do próximo retorno e reconciliação idempotente
api/test/unit/digest.test.ts        montagem e texto do resumo diário
api/test/integration/api.test.ts    API + PostgreSQL reais: transições, histórico, concorrência,
                                    constraints, edição, contatos, job e envio idempotente, API key
```

São 93 testes. Os de integração rodam contra um banco separado (`nobre_crm_test`), recriado do zero a cada execução, então nunca tocam os dados de desenvolvimento. Há um workflow de CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) que roda typecheck e testes da API com Postgres, além de lint e build do front.

---

## Dados do case e lacunas

"Campos em branco são intencionais" foi tratado assim:

| Lacuna | Tratamento |
| --- | --- |
| OPP-2001 sem validade de proposta | Coerente: está em Primeiro Contato e ainda não há proposta. A regra "Follow-up exige validade" impede que ela avance para Follow-up sem esse dado. |
| OPP-2007 Perdida, sem motivo na planilha | O motivo é obrigatório (e o banco garante). Na carga, ficou registrado explicitamente **"Motivo não registrado na planilha de origem"**, em vez de inventar um motivo ou afrouxar a regra. |
| Data de entrada do lead não existe | Uso o último contato como aproximação, documentado no código da carga. |
| Sem histórico de etapas anterior | Cada oportunidade recebe um registro "Carga inicial" com autor `carga-inicial`. |
| Etapas da planilha podem não cumprir as regras novas | A carga importa a situação como está (é um retrato do passado). As regras valem para toda mudança feita daqui em diante. |

---

## Limitações e próximos passos

- **Sem autenticação** (fora do escopo pedido). Ver [Segurança](#segurança).
- **Datas sem hora:** contato e entrada do lead são por dia, porque a planilha é por dia. Um SLA em minutos (problema 1) exige `TIMESTAMPTZ`.
- **Tipos duplicados** entre API e front (`web/src/lib/types.ts`). O próximo passo seria gerar um contrato OpenAPI a partir dos schemas zod e gerar o cliente.
- **Sem paginação:** com o volume atual, carregar o funil inteiro é mais simples e rápido. Com milhares de oportunidades, a paginação seria por coluna.
- **Job dentro do processo da API**, adequado para rodar localmente. Em produção, um agendador externo (ver acima).
- **Sem suíte E2E versionada.** Os fluxos principais (arrastar, recusa, motivo de perda, filtros, agenda) foram exercitados num navegador real durante o desenvolvimento, mas o teste não ficou no repositório. Seria o próximo item (Playwright no CI).
- Limiares (cadências, 3/7/14 dias) estão como constantes nomeadas no domínio. Com uso real, viriam de configuração ajustada com o time comercial.

---

## Uso de IA

Este projeto foi desenvolvido em par com o **Claude Code** (Anthropic), usado como assistente de programação para estruturar o projeto, escrever código e testes, revisar o comportamento no navegador e redigir esta documentação. As decisões de produto e de regra de negócio (transições, retornos permitidos, limiares de atenção, escolha da automação) foram discutidas, revisadas e validadas por mim. Os commits com participação da IA estão marcados com `Co-Authored-By`.
