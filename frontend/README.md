# Frontend — Portal Malb Imóveis

Site público (busca, listagem, página de imóvel) e painel do corretor.

**Status:** Fases 2 e 3 concluídas — site real conectado à API, com busca avançada, favoritos, mapa e SEO.

## `site/` — site real (Fases 2 e 3, conectado à API)

Site público + painel do corretor, em HTML/CSS/JS puro, que consome a API real em `backend/`:

- `site/index.html` — home, com estatísticas e destaques vindos do banco de dados de verdade
- `site/busca.html` — busca com filtros (finalidade, tipo, quartos, bairro, preço, área) e ordenação
- `site/imovel.html?id=N` — página de imóvel, com mapa (Leaflet/OpenStreetMap), botão de favoritar, formulário de interesse que grava um lead de verdade, e título/meta tags dinâmicos para SEO
- `site/favoritos.html` — imóveis favoritados, salvos no navegador de quem visita (sem precisar de login)
- `site/admin/login.html` e `site/admin/index.html` — painel do corretor (login, CRUD de imóveis incluindo latitude/longitude, lista de leads)
- `site/robots.txt` — o `sitemap.xml` referenciado nele é gerado dinamicamente pelo backend (não é um arquivo estático aqui)

**Como abrir:** não precisa de nenhum bundler nem `npm install`. Rode o backend (`node backend/src/server.js`) e acesse `http://localhost:3001` — ele já serve estes arquivos.

Sobre a stack: o `README.md` da raiz propõe Next.js para a versão de produção (SSR, SEO). Esta versão usa HTML/JS puro porque o ambiente onde foi construída não tinha acesso ao npm para instalar o Next.js — o contrato de API e o design system já estão prontos, então migrar essas páginas para componentes Next.js depois é um trabalho de adaptação, não uma reconstrução do zero.

## `prototipo.html` — protótipo da Fase 1 (mantido como referência)

Protótipo navegável com dados fictícios embutidos no próprio arquivo (sem backend). Serviu para validar a experiência antes de existir uma API — mantido aqui como referência histórica e para visualização rápida sem precisar rodar o servidor.
