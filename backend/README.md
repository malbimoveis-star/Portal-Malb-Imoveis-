# Backend — Portal Malb Imóveis

API REST de imóveis, leads (com funil de atendimento e equipe), autenticação e integração com CRMs parceiros. **Fases 2, 3, 4 e 5 do roadmap: implementadas e testadas.**

## Como rodar

Não precisa instalar nada (zero dependências de npm). Só precisa de **Node.js 22.5+** (usa o módulo nativo `node:sqlite`).

```bash
cd backend
node src/server.js
```

Na primeira execução, o servidor cria o banco de dados (`backend/data/malb.db`, SQLite) e popula automaticamente com:

- os 12 imóveis de exemplo (os mesmos do protótipo da Fase 1, com as mesmas fotos ilustrativas);
- um usuário de demonstração para o painel do corretor, já com papel de **administrador**: **admin@malbimoveis.com** / **malb2026** — troque essa senha e cadastre os corretores de verdade na aba Equipe antes de usar com dados reais.

O servidor sobe em `http://localhost:3001` e serve **tudo num único processo**: a API em `/api/*` e o site público + painel do corretor (arquivos em `../frontend/site/`). Basta abrir `http://localhost:3001` no navegador.

Para desenvolvimento com recarregamento automático ao salvar um arquivo:

```bash
npm run dev
```

## Por que não é NestJS + PostgreSQL ainda?

O `README.md` na raiz do projeto propõe NestJS + Prisma + PostgreSQL como stack de produção — essa decisão continua de pé. Esta implementação usa apenas módulos nativos do Node (`http`, `sqlite`, `crypto`) porque o ambiente onde ela foi escrita não tinha acesso ao registro do npm para instalar pacotes.

O modelo de dados e os contratos de API (ver `docs/API.md`) já foram desenhados pensando nessa migração: trocar esta camada por NestJS + Prisma + PostgreSQL depois é uma **troca de implementação**, não uma reescrita do zero — as rotas, os campos e as regras de negócio (autenticação, validação, permissões) continuam os mesmos.

## Endpoints

Ver `docs/API.md` para a referência completa. Resumo:

| Método | Rota | Autenticação | Descrição |
|---|---|---|---|
| GET | `/api/imoveis` | não | Lista imóveis (filtros via query string) |
| GET | `/api/imoveis/:id` | não | Detalhe de um imóvel |
| POST | `/api/imoveis` | sim | Cria um imóvel |
| PUT | `/api/imoveis/:id` | sim | Atualiza um imóvel |
| DELETE | `/api/imoveis/:id` | sim | Remove um imóvel |
| POST | `/api/leads` | não | Registra um lead (formulário de interesse) |
| GET | `/api/leads` | sim | Lista leads (filtros `status`, `corretorId`) — alimenta o funil Kanban |
| GET | `/api/leads/:id` | sim | Detalhe de um lead |
| PUT | `/api/leads/:id` | sim | Atualiza `status` e/ou `corretorId` de um lead — Fase 5 |
| GET | `/api/leads/:id/interacoes` | sim | Linha do tempo de atendimento do lead — Fase 5 |
| POST | `/api/leads/:id/interacoes` | sim | Registra uma nota manual no atendimento — Fase 5 |
| GET | `/api/usuarios` | sim | Lista a equipe (quem tem login no painel) — Fase 5 |
| POST | `/api/usuarios` | sim (admin) | Cria um novo login — Fase 5 |
| PUT | `/api/usuarios/:id` | sim (admin) | Edita/desativa um usuário — Fase 5 |
| DELETE | `/api/usuarios/:id` | sim (admin) | Exclui um usuário — Fase 5 |
| POST | `/api/auth/login` | não | Login (e-mail + senha) |
| POST | `/api/auth/logout` | sim | Encerra a sessão |
| GET | `/api/auth/me` | sim | Dados do usuário logado |
| GET | `/api/health` | não | Health check |
| GET | `/sitemap.xml` | não | Sitemap gerado a partir dos imóveis ativos (Fase 3 — SEO) |
| GET/POST/PUT/DELETE | `/api/parceiros*` | sim (sessão) | Gestão de parceiros CRM pelo painel (Fase 4) |
| GET/POST/DELETE | `/api/v1/parceiros/*` | sim (`X-Api-Key`) | API pública de import/export e webhooks para CRMs parceiros (Fase 4) |

Autenticação: enviar `Authorization: Bearer <token>` (token obtido no login, sessão válida por 7 dias) nas rotas internas; a API de parceiros usa uma chave de API própria no header `X-Api-Key`, gerada no painel. Desde a Fase 5, todo usuário tem um `papel` (`admin` ou `corretor`) — só `admin` pode gerenciar a equipe, o resto das rotas continua igual pros dois papéis. Ver `docs/API.md` para a referência completa, ou a versão navegável em `/docs.html`.

## Estrutura

```
backend/
├── src/
│   ├── server.js       # servidor HTTP (API + arquivos estáticos do front)
│   ├── router.js        # roteador minúsculo com suporte a :parametros
│   ├── db.js             # schema SQLite + seed automático
│   ├── auth.js           # login, sessões, hash de senha (scrypt), bloqueio de usuário inativo
│   ├── auth-parceiro.js  # chave de API dos parceiros (hash SHA-256) — Fase 4
│   ├── webhooks.js       # disparo assinado (HMAC) de webhooks — Fase 4
│   └── routes/
│       ├── imoveis.js
│       ├── leads.js      # inclui funil, atribuição e linha do tempo de atendimento — Fase 5
│       ├── auth.js
│       ├── usuarios.js   # gestão da equipe (admin) — Fase 5
│       └── parceiros.js  # rotas de gestão (painel) e da API pública v1 — Fase 4
└── data/
    ├── seed-imoveis.json  # dados de exemplo (versionado)
    └── malb.db             # banco gerado ao rodar (ignorado pelo git)
```

## Testado

Suite manual de ponta a ponta rodada nesta sessão: health check, CRUD completo de imóveis (criar/listar/filtrar/editar/excluir), autenticação (login certo/errado, rotas protegidas retornando 401 sem token), criação de lead público e listagem autenticada — todos os fluxos confirmados funcionando via `curl` e depois via navegador (Playwright), incluindo o fluxo completo pelo painel: criar imóvel → aparece na busca pública; enviar lead pelo site → aparece no painel.

**Fase 3 (sessão seguinte):** ordenação e filtros novos (`orderBy`, `areaMin`/`areaMax`) testados via `curl`; migração automática de bancos antigos sem as colunas `lat`/`lng` testada isoladamente (`ALTER TABLE` condicional); fluxo completo de favoritos (favoritar num card, ver em `favoritos.html`, desfavoritar) e criação de imóvel com latitude/longitude pelo painel testados via Playwright. O carregamento do mapa em si (biblioteca Leaflet via CDN) não pôde ser testado nesta sessão porque o ambiente de desenvolvimento não tem acesso geral à internet — o *fallback* ("mapa indisponível") foi confirmado funcionando; vale conferir o mapa carregando de fato ao rodar na sua máquina.

**Fase 4 (sessão seguinte):** migração das colunas `origem`/`parceiro_id`/`referencia_externa` testada isoladamente em banco novo e existente; suíte de ponta a ponta via script Node (`fetch`) cobrindo os 14 passos do fluxo de um parceiro — criar parceiro, gerar chave, exportar (JSON e XML), importar com upsert (reenvio da mesma `referenciaExterna` atualiza em vez de duplicar), disparo de webhook `lead.criado` por um lead público e `imovel.atualizado` por uma mudança de status no painel, verificação independente da assinatura HMAC do payload recebido, log de entregas, regeneração de chave, e bloqueio de acesso após desativar o parceiro — todos passando; webhooks testados ponta a ponta contra um segundo servidor HTTP local fazendo o papel do CRM parceiro (tráfego localhost, não depende de internet). A aba "Parceiros (CRMs)" do painel foi testada visualmente e funcionalmente via Playwright: criar parceiro, modal de chave gerada, tabela com selo de status, modal de entregas, regenerar chave, editar (suspender) e excluir — todos confirmados funcionando, com screenshot do modal de chave conferido. O Swagger UI em `/docs.html` (biblioteca via CDN) não pôde ser testado visualmente nesta sessão pela mesma limitação de rede da Fase 3 — a especificação OpenAPI em si foi validada como YAML bem-formado.

**Fase 5 (sessão seguinte):** migração de `users.papel`/`users.ativo`/`leads.corretor_id` testada isoladamente — confirmado que o único usuário de um banco pré-existente é promovido a `admin` automaticamente na primeira subida após a atualização. Suíte de 24 verificações via script Node (`fetch`) cobrindo: login retornando `papel`; listagem da equipe; criação de corretor; corretor comum bloqueado (403) de criar outro usuário; trava do último admin ativo (400 ao tentar desativar o único admin); criação de lead público; atribuição a um corretor; mudança de status; linha do tempo com as 3 entradas automáticas na ordem certa (sistema → atribuição → status) mais uma nota manual; filtro de leads por `corretorId`; desativação de usuário bloqueando login novo E invalidando a sessão já aberta na hora; exclusão de usuário desatribuindo o lead (`ON DELETE SET NULL`) — todos passando. Um segundo script confirmou o webhook `lead.atualizado` disparando para o parceiro quando o status de um lead do imóvel dele muda, chegando assinado, junto do `lead.criado` original. A interface foi testada visualmente e funcionalmente via Playwright: quadro Kanban com as 4 colunas, criação de corretor pela aba Equipe, abertura do modal de lead, atribuição e mudança de status refletindo no card e na timeline, registro de nota manual, filtro por corretor, ocultação do botão de excluir na própria linha do usuário logado, e exclusão de usuário — todos confirmados, com screenshot do quadro Kanban e do modal de lead com a timeline conferidos.
