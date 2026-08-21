# Portal Malb Imóveis

Portal imobiliário da Malb Imóveis: busca e divulgação de imóveis para o público, painel interno para gestão de anúncios e leads, e uma API própria para integração com sistemas de CRM imobiliário (importação/exportação de imóveis, portabilidade de dados entre plataformas).

Referência funcional e de estrutura: [vivareal.com.br](https://www.vivareal.com.br/).

## Status

Fase 1 (Fundação) em andamento. Primeiro protótipo navegável disponível em [`frontend/prototipo.html`](frontend/prototipo.html) — home, busca com filtros e página de imóvel, com dados fictícios (ainda sem backend real). Veja o roadmap completo em [`docs/ROADMAP.md`](docs/ROADMAP.md).

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

## Stack proposta (a confirmar com o time)

- **Frontend:** Next.js (React) — SSR para SEO dos anúncios, painel administrativo
- **Backend:** Node.js com NestJS — API REST, autenticação, integrações
- **Banco de dados:** PostgreSQL + PostGIS (busca geográfica)
- **Busca/filtros:** Meilisearch ou Elasticsearch
- **Armazenamento de imagens:** S3-compatível (ex: Cloudflare R2)
- **Deploy:** a definir (Vercel/Railway/AWS) — ver seção de decisões pendentes no roadmap
