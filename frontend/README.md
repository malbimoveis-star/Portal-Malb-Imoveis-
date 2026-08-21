# Frontend — Portal Malb Imóveis

Site público (busca, listagem, página de imóvel) e painel do corretor.

**Status:** Fases 2, 3, 4, 5 e 6 concluídas — site real conectado à API, com busca avançada, favoritos, mapa, SEO, o painel de integração com CRMs parceiros e o CRM interno (funil de leads e equipe). A Fase 6 não mudou nada aqui na interface: ela deixou o backend (`backend/`) pronto para produção — ver `backend/README.md` e `docs/DEPLOY.md`.

## `site/` — site real (Fases 2 a 5, conectado à API)

Site público + painel do corretor, em HTML/CSS/JS puro, que consome a API real em `backend/`:

- `site/index.html` — home, com estatísticas e destaques vindos do banco de dados de verdade
- `site/busca.html` — busca com filtros (finalidade, tipo, quartos, bairro, preço, área) e ordenação
- `site/imovel.html?id=N` — página de imóvel, com mapa (Leaflet/OpenStreetMap), botão de favoritar, formulário de interesse que grava um lead de verdade, e título/meta tags dinâmicos para SEO
- `site/favoritos.html` — imóveis favoritados, salvos no navegador de quem visita (sem precisar de login)
- `site/admin/login.html` e `site/admin/index.html` — painel do corretor: login, CRUD de imóveis incluindo latitude/longitude; aba **Leads** com o funil de atendimento em quadro Kanban (Novo/Em atendimento/Convertido/Perdido), atribuição a um corretor, filtro por corretor, e um modal de lead com a linha do tempo de atendimento e campo para notas manuais; aba **Equipe** para o administrador cadastrar, editar, desativar e excluir os logins do painel; aba **Parceiros (CRMs)** para gerir a integração da Fase 4 (criar parceiros, gerar/regenerar chave de API, ver o selo "via parceiro" nos imóveis importados e o log de entregas de webhook)
- `site/docs.html` — documentação interativa da API (Swagger UI, carregado via CDN) a partir de `site/openapi.yaml`
- `site/openapi.yaml` — especificação OpenAPI 3.0 de toda a API, incluindo as rotas de leads/equipe (Fase 5) e de integração com parceiros (`/api/v1/parceiros/*`, Fase 4)
- `site/robots.txt` — o `sitemap.xml` referenciado nele é gerado dinamicamente pelo backend (não é um arquivo estático aqui)

**Como abrir:** não precisa de nenhum bundler nem `npm install`. Rode o backend (`node backend/src/server.js`) e acesse `http://localhost:3001` — ele já serve estes arquivos.

Sobre a stack: o `README.md` da raiz propõe Next.js para a versão de produção (SSR, SEO). Esta versão usa HTML/JS puro porque o ambiente onde foi construída não tinha acesso ao npm para instalar o Next.js — o contrato de API e o design system já estão prontos, então migrar essas páginas para componentes Next.js depois é um trabalho de adaptação, não uma reconstrução do zero.

## `prototipo.html` — protótipo da Fase 1 (mantido como referência)

Protótipo navegável com dados fictícios embutidos no próprio arquivo (sem backend). Serviu para validar a experiência antes de existir uma API — mantido aqui como referência histórica e para visualização rápida sem precisar rodar o servidor.
