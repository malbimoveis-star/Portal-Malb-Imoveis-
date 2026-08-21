# Arquitetura técnica — Portal Malb Imóveis

## Visão geral

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│   Frontend        │      │   Backend (API)    │      │   Banco de dados  │
│   Next.js (React)  │◄────►│   NestJS / REST    │◄────►│   PostgreSQL +    │
│   Portal público +  │      │   Autenticação,     │      │   PostGIS          │
│   Painel admin      │      │   regras de negócio │      │                    │
└─────────────────┘      └────────┬─────────┘      └─────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼                              ▼
          ┌──────────────────┐          ┌──────────────────┐
          │  API de integração │          │  Busca (Meilisearch/│
          │  (import/export     │          │  Elasticsearch)      │
          │  XML/JSON com CRMs) │          │                        │
          └──────────────────┘          └──────────────────┘
```

## Componentes

### Frontend (`/frontend`)
- Next.js com SSR/SSG nas páginas de imóvel (essencial para SEO, igual à VivaReal).
- Painel administrativo como área autenticada dentro do mesmo app (ou app separado, a definir na Fase 2).

### Backend (`/backend`)
- API REST (avaliar GraphQL para o painel administrativo, se fizer sentido na Fase 2).
- Módulos previstos: `imoveis`, `usuarios`, `leads`, `corretores`, `integracoes`.
- Autenticação via JWT, com perfis: admin, corretor, cliente.

### Banco de dados
- PostgreSQL como banco principal.
- Extensão PostGIS para busca por proximidade/mapa.
- Migrations versionadas (ex: Prisma ou TypeORM, a definir na Fase 2).

### API de integração com CRMs (Fase 4)
Objetivo: permitir que sistemas de CRM parceiros publiquem, atualizem e removam imóveis no portal, e que a Malb Imóveis também exporte seus imóveis para outros portais — a mesma lógica de portabilidade que a VivaReal oferece às imobiliárias hoje.

Formatos previstos:
- **Import/export XML**: formato próximo ao padrão adotado por portais imobiliários brasileiros (feed de imóveis com campos como código, tipo, endereço, preço, fotos, características).
- **API REST/JSON**: para integrações mais modernas, com autenticação por chave de API por parceiro.
- **Webhooks**: notificar sistemas parceiros quando um imóvel muda de status (vendido/alugado/reservado).

Documentação da API será publicada em OpenAPI/Swagger assim que os endpoints forem definidos na Fase 4.

### Infraestrutura (`/infra`)
- Deploy e variáveis de ambiente.
- CI/CD (a definir — ex: GitHub Actions) para rodar testes e publicar automaticamente a cada merge na branch principal.

## Modelo de dados inicial (rascunho — Fase 1)

**Imóvel**
- id, título, descrição, tipo (apartamento/casa/terreno/comercial)
- finalidade (venda/aluguel), preço, condomínio, IPTU
- endereço, bairro, cidade, latitude, longitude
- quartos, banheiros, vagas, área útil, área total
- fotos (galeria), status (disponível/reservado/vendido/alugado)
- corretor_id, imobiliaria_id, criado_em, atualizado_em

**Lead**
- id, imóvel_id, nome, telefone, email, mensagem, origem, status, criado_em

Esse modelo será refinado e migrado para o banco real na Fase 2.
