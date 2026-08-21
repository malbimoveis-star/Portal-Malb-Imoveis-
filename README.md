# Portal Malb Imóveis

Portal imobiliário da Malb Imóveis: busca e divulgação de imóveis para o público, painel interno para gestão de anúncios e leads, e uma API própria para integração com sistemas de CRM imobiliário (importação/exportação de imóveis, portabilidade de dados entre plataformas).

Referência funcional e de estrutura: [vivareal.com.br](https://www.vivareal.com.br/).

## Status

**Fases 2 (Backend core), 3 (Busca e experiência pública), 4 (API de integração com CRMs parceiros), 5 (CRM interno) e 6 (hardening de produção) implementadas e testadas.** A API real está no ar (`backend/`) com banco de dados, CRUD de imóveis, leads e autenticação — e o site público + painel do corretor (`frontend/site/`) já consomem essa API de verdade, não mais dados fictícios estáticos. A busca tem filtros avançados (bairro, área, ordenação), há favoritos salvos no navegador, mapa na página do imóvel (OpenStreetMap) e SEO básico (`sitemap.xml`, `robots.txt`, meta tags). CRMs parceiros já podem importar/exportar imóveis e receber webhooks de leads e mudanças de status via chave de API própria (aba "Parceiros (CRMs)" no painel, documentação interativa em `/docs.html`). O painel também tem um funil de atendimento em quadro Kanban (Novo → Em atendimento → Convertido/Perdido), atribuição de leads a um corretor, histórico de atendimento por lead, e uma aba "Equipe" para o administrador cadastrar e gerenciar quem tem acesso ao painel. Para publicar de verdade, o projeto já tem variáveis de ambiente, rate limiting, cabeçalhos de segurança, backup de banco e artefatos de deploy (Docker/systemd + guia passo a passo em `docs/DEPLOY.md`) prontos — falta só você decidir domínio e hospedagem. Para rodar tudo localmente:

```bash
cd backend && node src/server.js
```

E acesse `http://localhost:3001`. Veja `backend/README.md` para detalhes e `docs/API.md` para a referência dos endpoints. Para publicar em produção, veja [`docs/DEPLOY.md`](docs/DEPLOY.md). O protótipo estático da Fase 1 continua em [`frontend/prototipo.html`](frontend/prototipo.html) como referência histórica. Roadmap completo e próximos passos em [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Estrutura do repositório

```
portal-malb-imoveis/
├── frontend/     # Site público + painel administrativo (Next.js)
├── backend/      # API REST/GraphQL, integrações de CRM (Node.js/NestJS)
├── infra/        # Infraestrutura, deploy, banco de dados, CI/CD
└── docs/         # Documentação: roadmap, arquitetura, modelo de dados, API
```

Cada pasta tem seu próprio `README.md` explicando o que vai nela e o estado atual.

## Documentação

- [Roadmap e cronograma](docs/ROADMAP.md)
- [Arquitetura técnica](docs/ARQUITETURA.md)
- [Referência da API](docs/API.md)

## Stack proposta (produção) vs. implementação atual

A stack de produção proposta continua a mesma (a confirmar com o time):

- **Frontend:** Next.js (React) — SSR para SEO dos anúncios, painel administrativo
- **Backend:** Node.js com NestJS — API REST, autenticação, integrações
- **Banco de dados:** PostgreSQL + PostGIS (busca geográfica)
- **Busca/filtros:** Meilisearch ou Elasticsearch
- **Armazenamento de imagens:** S3-compatível (ex: Cloudflare R2)
- **Deploy:** a definir (Vercel/Railway/AWS) — ver seção de decisões pendentes no roadmap

**Nota sobre a implementação atual da Fase 2:** o backend em `backend/` e o site em `frontend/site/` foram construídos com Node.js puro (sem NestJS) e SQLite (sem PostgreSQL), porque o ambiente onde foram escritos não tinha acesso ao registro do npm para instalar pacotes. O modelo de dados e os contratos de API já foram desenhados para a migração — ver `backend/README.md` para os detalhes dessa decisão. Essa mesma limitação de ambiente segue valendo na Fase 6: em vez de migrar para NestJS/Prisma/Next.js sem poder testar nada, a Fase 6 preparou a stack atual para produção de verdade (ver `infra/README.md`).
