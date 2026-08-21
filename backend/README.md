# Backend — Portal Malb Imóveis

API REST de imóveis, leads e autenticação. **Fase 2 do roadmap: implementada e testada.**

## Como rodar

Não precisa instalar nada (zero dependências de npm). Só precisa de **Node.js 22.5+** (usa o módulo nativo `node:sqlite`).

```bash
cd backend
node src/server.js
```

Na primeira execução, o servidor cria o banco de dados (`backend/data/malb.db`, SQLite) e popula automaticamente com:

- os 12 imóveis de exemplo (os mesmos do protótipo da Fase 1, com as mesmas fotos ilustrativas);
- um usuário de demonstração para o painel do corretor: **admin@malbimoveis.com** / **malb2026** — troque essa senha antes de usar com dados reais.

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
| GET | `/api/leads` | sim | Lista leads recebidos |
| PUT | `/api/leads/:id` | sim | Atualiza o status de um lead |
| POST | `/api/auth/login` | não | Login (e-mail + senha) |
| POST | `/api/auth/logout` | sim | Encerra a sessão |
| GET | `/api/auth/me` | sim | Dados do usuário logado |
| GET | `/api/health` | não | Health check |
| GET | `/sitemap.xml` | não | Sitemap gerado a partir dos imóveis ativos (Fase 3 — SEO) |

Autenticação: enviar `Authorization: Bearer <token>` (token obtido no login, sessão válida por 7 dias).

## Estrutura

```
backend/
├── src/
│   ├── server.js       # servidor HTTP (API + arquivos estáticos do front)
│   ├── router.js        # roteador minúsculo com suporte a :parametros
│   ├── db.js             # schema SQLite + seed automático
│   ├── auth.js           # login, sessões, hash de senha (scrypt)
│   └── routes/
│       ├── imoveis.js
│       ├── leads.js
│       └── auth.js
└── data/
    ├── seed-imoveis.json  # dados de exemplo (versionado)
    └── malb.db             # banco gerado ao rodar (ignorado pelo git)
```

## Testado

Suite manual de ponta a ponta rodada nesta sessão: health check, CRUD completo de imóveis (criar/listar/filtrar/editar/excluir), autenticação (login certo/errado, rotas protegidas retornando 401 sem token), criação de lead público e listagem autenticada — todos os fluxos confirmados funcionando via `curl` e depois via navegador (Playwright), incluindo o fluxo completo pelo painel: criar imóvel → aparece na busca pública; enviar lead pelo site → aparece no painel.

**Fase 3 (sessão seguinte):** ordenação e filtros novos (`orderBy`, `areaMin`/`areaMax`) testados via `curl`; migração automática de bancos antigos sem as colunas `lat`/`lng` testada isoladamente (`ALTER TABLE` condicional); fluxo completo de favoritos (favoritar num card, ver em `favoritos.html`, desfavoritar) e criação de imóvel com latitude/longitude pelo painel testados via Playwright. O carregamento do mapa em si (biblioteca Leaflet via CDN) não pôde ser testado nesta sessão porque o ambiente de desenvolvimento não tem acesso geral à internet — o *fallback* ("mapa indisponível") foi confirmado funcionando; vale conferir o mapa carregando de fato ao rodar na sua máquina.
