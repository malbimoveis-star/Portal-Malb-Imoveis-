# Roadmap — Portal Malb Imóveis

## 1. Visão do projeto

Construir o Portal Malb Imóveis com o mesmo perfil funcional e estrutural do site de referência (vivareal.com.br):

- **Portal público**: busca de imóveis por localização/filtros, página de detalhes do imóvel, mapa, favoritos, contato com corretor.
- **Painel interno (CRM próprio)**: cadastro e gestão de imóveis, gestão de leads, controle de corretores.
- **API de integração**: import/export de imóveis em formato compatível com CRMs imobiliários de mercado, permitindo portabilidade de dados entre a Malb Imóveis e sistemas parceiros.

## 2. Escopo de referência inspirado na VivaReal

| Área | Funcionalidade |
|---|---|
| Busca | Filtros por cidade/bairro, tipo de imóvel, faixa de preço, quartos/vagas, área |
| Listagem | Cards de imóvel com foto, preço, resumo, favoritar |
| Detalhe do imóvel | Galeria de fotos, descrição, mapa, dados do corretor/imobiliária, formulário de contato |
| Conta de usuário | Login, imóveis favoritados, histórico de buscas |
| Painel do corretor/imobiliária | Cadastro/edição de imóveis, fotos, status (disponível/vendido/alugado), leads recebidos |
| Integração externa | API para outras imobiliárias/CRMs publicarem ou consultarem imóveis (padrão XML/JSON usado no mercado imobiliário) |

## 3. Cronograma proposto

O cronograma abaixo é organizado por **fases com entregas verificáveis**, não por "horas de codificação" — o ritmo real depende de quanto cada fase é revisada e aprovada antes de avançar para a próxima, para evitar retrabalho. As durações são uma referência inicial e podem ser reajustadas fase a fase.

| Fase | Duração estimada | Entrega |
|---|---|---|
| **Fase 0 — Descoberta** | Concluída | Este roadmap, estrutura inicial do repositório |
| **Fase 1 — Fundação** | Concluída | Design system, protótipo navegável (home, busca, listagem, detalhe do imóvel) com dados de exemplo |
| **Fase 2 — Backend core** | Concluída (MVP) | API REST de imóveis (CRUD), autenticação, banco de dados real, painel do corretor — ver ressalva abaixo sobre a stack |
| **Fase 3 — Busca e experiência pública** | 2 semanas | Filtros avançados, mapa, favoritos, formulário de leads, SEO das páginas de imóvel |
| **Fase 4 — API de integração com CRMs** | 2 semanas | Import/export de imóveis (XML/JSON), webhooks, documentação da API (Swagger/OpenAPI), autenticação de parceiros |
| **Fase 5 — CRM interno** | 2 semanas | Gestão de leads, funil de atendimento, atribuição a corretores |
| **Fase 6 — Publicação** | 1–2 semanas | Testes, performance, domínio e deploy em produção |
| **Fase 7 — Evolução contínua** | Contínua | Novas integrações, ajustes por feedback real de uso |

**Estimativa total até o lançamento (Fases 1–6): 10–12 semanas**, considerando ciclos de revisão semanais. Esse prazo é o de um projeto sendo construído e revisado por uma pessoa; ele encurta se houver revisões mais frequentes e alonga se o escopo crescer no meio do caminho — por isso cada fase termina com uma entrega concreta para aprovar antes de seguir.

## 4. Progresso até agora

**Fase 1 — Fundação:**
- [x] Design system (cores, tipografia) baseado na logo da Malb
- [x] Protótipo navegável (`frontend/prototipo.html`) — home, busca com filtros, página de imóvel, dados e fotos fictícias
- [x] Aprovado para seguir adiante (cliente pediu para avançar para o restante do projeto)

**Fase 2 — Backend core:**
- [x] API REST de imóveis: listar (com filtros), detalhe, criar, editar, excluir
- [x] Banco de dados real (SQLite, ver ressalva de stack abaixo) populado com os imóveis de exemplo
- [x] Autenticação (login, sessão, rotas protegidas)
- [x] API de leads (formulário de interesse grava no banco; painel lista os leads recebidos)
- [x] Painel do corretor: login, listar/criar/editar/excluir imóveis, ver e atualizar status de leads
- [x] Site público migrado de dados estáticos para a API real (`frontend/site/`)
- [x] Testado de ponta a ponta (API via curl + fluxos completos no navegador)

**Ressalva importante sobre a Fase 2:** o roadmap propõe NestJS + Prisma + PostgreSQL para produção. Esta implementação usa Node.js puro + SQLite porque o ambiente onde foi construída não tinha acesso ao registro do npm para instalar pacotes — então não foi possível instalar NestJS/Prisma nem testá-los rodando. O modelo de dados e os endpoints (`docs/API.md`) foram desenhados para que migrar para a stack de produção depois seja uma troca de camada, não uma reescrita. Isso deve ser feito assim que houver um ambiente de desenvolvimento com acesso normal ao npm (sua máquina, por exemplo, ou uma sessão futura com esse acesso).

## 5. Decisões pendentes (precisamos da sua confirmação)

1. **Stack técnica** — confirmar NestJS + Prisma + PostgreSQL para produção (a Fase 2 atual roda em Node puro + SQLite por limitação do ambiente, ver seção 4).
2. **Domínio** — qual será o domínio do portal (ex: `malbimoveis.com.br`)? Necessário para a Fase 6 (publicação).
3. ~~**Identidade visual**~~ — ✅ definida: logo e paleta azul/verde da Malb já aplicadas.
4. **Dados iniciais** — continuar com os imóveis de exemplo, ou já existe uma planilha/CRM para importar imóveis reais?
5. **CRM de referência para a API** — se você já usa algum CRM imobiliário hoje (ex: Vista, União, JetImóveis), isso define o formato prioritário da Fase 4 (import/export).
6. **Hospedagem/deploy** — provedor já contratado, ou seguir a recomendação (Vercel + Railway/AWS)? Necessário para a Fase 6.

## 6. Próximos passos sugeridos

Com a Fase 2 pronta, a ordem natural é:

1. Você testar o painel do corretor e a busca no ambiente local (`node backend/src/server.js` → `http://localhost:3001`) e apontar o que precisa ajustar.
2. Fase 3 — busca avançada (mapa, favoritos persistidos por usuário), SEO das páginas de imóvel.
3. Fase 4 — API de integração com CRMs parceiros (import/export, webhooks, documentação Swagger/OpenAPI pública).
4. Fase 5 — CRM interno mais completo (funil de atendimento, atribuição de leads a corretores).
5. Fase 6 — migrar para a stack de produção (NestJS/Prisma/PostgreSQL/Next.js) e publicar de fato, o que depende das decisões 1, 2 e 6 acima.
