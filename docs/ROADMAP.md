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
| **Fase 3 — Busca e experiência pública** | Concluída (MVP) | Filtros avançados, mapa, favoritos, formulário de leads, SEO das páginas de imóvel — ver ressalva abaixo sobre o mapa |
| **Fase 4 — API de integração com CRMs** | Concluída (MVP) | Import/export de imóveis (XML/JSON), webhooks, documentação da API (Swagger/OpenAPI), autenticação de parceiros — ver ressalvas abaixo |
| **Fase 5 — CRM interno** | Concluída (MVP) | Gestão de leads, funil de atendimento, atribuição a corretores — ver detalhes abaixo |
| **Fase 6 — Publicação** | Concluída (parte de infraestrutura) | Hardening de produção e artefatos de deploy prontos — ver ressalva abaixo sobre domínio/hospedagem e migração de stack |
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

**Fase 3 — Busca e experiência pública:**
- [x] Filtros avançados: bairro (lista dinâmica), área mínima, ordenação (mais recentes, menor/maior preço, maior área)
- [x] Favoritos: salvos no navegador de quem visita (sem precisar de login), com página própria (`favoritos.html`)
- [x] Mapa na página do imóvel (Leaflet + OpenStreetMap, sem precisar de chave de API paga) — ver ressalva abaixo
- [x] Formulário de leads (já existia desde a Fase 2, mantido)
- [x] SEO: título e meta description dinâmicos na página do imóvel, `sitemap.xml` gerado a partir dos imóveis ativos, `robots.txt`

**Ressalva importante sobre a Fase 3:** o mapa usa a biblioteca Leaflet carregada de um CDN público (`unpkg.com`), então precisa de acesso normal à internet no navegador de quem visita o site — não precisa de chave de API nem custo, mas não funciona em redes totalmente bloqueadas. Testei o carregamento e o *fallback* (mensagem "mapa indisponível" quando o CDN não responde), mas não consegui testar o mapa renderizado de fato nesta sessão porque o ambiente onde construí o projeto não tem acesso geral à internet — vale conferir visualmente ao abrir o site na sua máquina. As coordenadas dos 12 imóveis de exemplo são aproximadas (uma por bairro), não o endereço exato.

**Fase 4 — API de integração com CRMs parceiros:**
- [x] Modelo de dados: parceiros (chave de API com hash, `webhookUrl`/`webhookSecret`), rastreamento de origem dos imóveis (`origem`, `parceiroId`, `referenciaExterna`), log de entregas de webhook
- [x] Autenticação de parceiros por chave de API (header `X-Api-Key`, chave `malb_...` armazenada com hash SHA-256, nunca em texto puro)
- [x] Exportação de imóveis ativos para o parceiro (`GET /api/v1/parceiros/imoveis` em JSON e `.xml` em feed XML próprio)
- [x] Importação/atualização de imóveis pelo parceiro, com upsert por `referenciaExterna` (`POST` e `DELETE /api/v1/parceiros/imoveis`)
- [x] Webhooks assinados (HMAC-SHA256, header `X-Malb-Signature`) para `lead.criado` e `imovel.atualizado`, mais um evento `teste` para o parceiro validar a integração
- [x] Painel do corretor: aba "Parceiros (CRMs)" para criar/editar/excluir parceiros, gerar e regenerar chave de API, ver o selo "via parceiro" nos imóveis importados, e consultar o log de entregas de webhook
- [x] Documentação interativa da API (OpenAPI 3.0 em `frontend/site/openapi.yaml`, navegável em `/docs.html` via Swagger UI) — ver ressalva abaixo
- [x] Testado de ponta a ponta: parceiro → chave → exportação (JSON e XML) → importação com upsert → webhook disparado por lead e por mudança de status → assinatura HMAC verificada de forma independente → log de entregas → regeneração de chave → desativação bloqueando acesso

**Ressalvas importantes sobre a Fase 4:**
1. **Entrega de webhook é *best-effort*, sem fila de retry** — uma única tentativa, timeout de 5s. Se o endpoint do parceiro estiver fora do ar no momento do disparo, a entrega falha e não é reenviada automaticamente (fica registrada como falha no log, mas o parceiro pode perder o evento). Uma fila de retry com backoff é uma melhoria natural para uma fase futura, mas ficou fora do escopo deste MVP.
2. **O formato XML do feed (`imoveis.xml`) é um formato próprio da Malb**, inspirado em convenções comuns de feeds do mercado imobiliário — não é uma cópia do schema proprietário de nenhum portal real, porque o ambiente onde este projeto foi construído não tinha acesso à internet para consultar a especificação exata de nenhum concorrente. Se um CRM parceiro específico exigir um formato diferente (ex: o schema de algum provedor de feeds já usado no mercado), isso é um ajuste direcionado, não uma reconstrução.
3. **O Swagger UI em `/docs.html` carrega a biblioteca de um CDN público** (`cdnjs.cloudflare.com`), mesma lógica do mapa da Fase 3 — funciona com acesso normal à internet no navegador, mas não pôde ser testado visualmente nesta sessão pela mesma limitação de rede. A especificação em si (`openapi.yaml`) foi validada (YAML bem-formado) e pode ser baixada e aberta em qualquer ferramenta OpenAPI mesmo se o Swagger UI não carregar.

**Fase 5 — CRM interno (funil de atendimento e equipe):**
- [x] Papel de usuário (`admin` | `corretor`) e usuário `ativo` — só admin cadastra/edita/exclui gente da equipe; um corretor comum só consulta a lista (precisa dela pra atribuir leads a si mesmo ou a um colega)
- [x] Aba "Equipe" no painel: cadastrar corretor (nome, e-mail, CRECI, senha inicial, papel), editar, desativar (revoga sessões na hora) e excluir — com trava para nunca ficar sem nenhum admin ativo, e sem permitir autoexclusão
- [x] Funil de atendimento: aba "Leads" virou um quadro Kanban com as quatro colunas de status (Novo, Em atendimento, Convertido, Perdido), com filtro por corretor responsável
- [x] Atribuição de leads a um corretor específico (`corretorId`), com o card do funil mostrando o nome do responsável ou "Sem corretor"
- [x] Histórico de atendimento por lead: linha do tempo com o recebimento do lead, toda mudança de status, toda atribuição/remoção de corretor (automáticas, atribuídas a quem fez a ação) e notas manuais que o corretor digita (ex: "liguei, vai confirmar até amanhã")
- [x] Se o lead é de um imóvel de parceiro (Fase 4) e o status muda, o parceiro recebe um novo webhook `lead.atualizado` — mesmo padrão de assinatura HMAC dos outros eventos
- [x] Testado de ponta a ponta: 24 verificações automatizadas cobrindo criação/edição/exclusão de usuários, a trava do último admin, bloqueio de acesso por papel (corretor não cria usuário) e por conta desativada (login bloqueado e sessão já aberta invalidada na hora), atribuição e mudança de status de lead com o histórico gerado corretamente, filtro por corretor, e o webhook `lead.atualizado` disparando e chegando assinado; a interface (quadro Kanban, modal do lead com linha do tempo, aba Equipe) foi testada visualmente e funcionalmente via Playwright, com screenshot conferido

**Fase 6 — Publicação (hardening de produção e infraestrutura):**
- [x] Variáveis de ambiente de produção (`backend/.env.example`): domínio permitido no CORS, rate limiting, ambiente, caminho do banco — carregadas nativamente via `node --env-file` (sem precisar de nenhum pacote de npm)
- [x] Cabeçalhos de segurança em toda resposta (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security` quando a conexão chega via HTTPS)
- [x] Rate limiting nos dois endpoints públicos sem autenticação (`POST /api/auth/login` e `POST /api/leads`), por IP, com resposta `429` + `Retry-After`
- [x] CORS restrito por variável de ambiente em produção (permissivo só em desenvolvimento, como antes)
- [x] Desligamento gracioso (`SIGTERM`/`SIGINT`): termina as requisições em andamento e fecha o banco antes de sair, para atualizações de versão não cortarem uma escrita no meio
- [x] Backup do banco SQLite (`backend/scripts/backup-db.js`, via `VACUUM INTO`, sem depender de nenhum binário externo) com retenção configurável, pensado para rodar via cron
- [x] Artefatos de deploy: `Dockerfile` + `docker-compose.yml` com proxy reverso Caddy (HTTPS automático via Let's Encrypt), e uma unidade `systemd` como alternativa sem Docker
- [x] Guia de publicação passo a passo (`docs/DEPLOY.md`): provisionar servidor, DNS, primeiro deploy, dados iniciais, backups, monitoramento, atualização e rollback
- [x] Testado: cabeçalhos de segurança, CORS restrito, HSTS condicional a HTTPS, os dois rate limiters (independentes entre si) disparando `429` no limite certo, desligamento gracioso, script de backup (conteúdo do backup conferido contra o banco original, e a retenção removendo os mais antigos corretamente); a lógica exata do `Dockerfile` (caminhos, variáveis de ambiente, healthcheck) foi validada simulando a mesma estrutura de diretórios do container — ver ressalva abaixo sobre o build do Docker em si

**Ressalvas importantes sobre a Fase 6:**
1. **A migração para NestJS + Prisma + PostgreSQL + Next.js (a stack de produção proposta neste roadmap) não foi feita.** O ambiente onde esta fase foi construída bloqueia o acesso ao registro do npm (`npm install` de qualquer pacote retorna 403), então não seria possível instalar, rodar nem testar de verdade um projeto nessa stack — e entregar uma reescrita completa (autenticação, permissões, funil de leads, webhooks assinados) sem poder testá-la contradiria o cuidado que todas as fases anteriores tiveram. Em vez disso, esta fase deixou a stack atual (Node puro + SQLite, testada em todas as fases desde a Fase 2) pronta para produção de verdade. O modelo de dados e os contratos de API continuam desenhados para que essa migração, feita num ambiente com acesso normal ao npm, seja uma troca de camada — não uma reescrita.
2. **Domínio e hospedagem continuam por sua conta** (ver "Decisões pendentes" abaixo) — comprar um domínio, contratar um servidor e inserir dados de pagamento não são ações que esta sessão pode fazer por você. O que foi preparado (Docker/systemd + `docs/DEPLOY.md`) funciona com qualquer VPS Linux comum, assim que você tiver os dois.
3. **O build da imagem Docker em si não pôde ser executado nesta sessão** — o daemon do Docker não roda neste ambiente de desenvolvimento (mesma limitação de sandbox aninhado). O `Dockerfile` foi revisado linha a linha e sua lógica de runtime (estrutura de diretórios, variáveis de ambiente, comando de healthcheck) foi validada simulando manualmente a mesma estrutura fora do Docker — mas vale rodar `docker compose build` de verdade na primeira vez que for publicar, para conferir.

**Fase 6.1 — SEO avançado (a pedido, fora da numeração original do roadmap):**

Pedido do cliente: usar meta tags de palavras-chave para aparecer mais no Google. A tag `<meta name="keywords">` não tem efeito no ranking do Google desde 2009 (o próprio Google ignora essa tag oficialmente) — em vez de adicioná-la, o que segue é o que de fato ajuda no SEO, no limite do que este site (estático, sem framework) permite:

- [x] Título e meta description de `imovel.html` e `busca.html` reformulados para levar o termo de maior intenção de busca (tipo + verbo "comprar/alugar" + bairro/cidade) para o início da frase — o padrão que a pesquisa de palavras-chave do setor imobiliário no Brasil aponta como o que as pessoas de fato digitam no Google, em vez de só repetir o nome da marca
- [x] Essas tags agora são geradas **no servidor** (`backend/src/seo.js`), não só via JavaScript no navegador como a Fase 3 tinha feito — importante porque robôs de prévia de link (WhatsApp, Facebook, LinkedIn) não executam JavaScript; sem isso, compartilhar o link de um imóvel específico mostraria uma prévia genérica em vez dos dados reais do imóvel
- [x] Open Graph e Twitter Card completos (título, descrição, URL) nas páginas públicas
- [x] Dados estruturados (JSON-LD, schema.org) — `RealEstateListing` com `Accommodation` (`Apartment`/`House`) e `Offer` (preço, disponibilidade) em cada imóvel; `BreadcrumbList` na busca; `RealEstateAgent` e `FAQPage` na home. O Google não tem hoje um rich snippet visual dedicado a imóveis (diferente de receitas ou produtos), mas esses dados ajudam a indexação semântica do Google e de motores de resposta por IA (Google AI Overviews, ChatGPT, Perplexity), que dependem de dados estruturados para entender a página
- [x] `<link rel="canonical">` em todas as páginas públicas — em `busca.html`, só bairro/tipo/finalidade entram no canonical (filtros como preço/área/ordenação não geram uma URL "oficial" própria, para não competir no índice do Google com variações quase idênticas da mesma busca)
- [x] Texto alternativo (`alt`) das fotos reescrito com tipo + bairro + finalidade em vez de um texto genérico — ajuda tanto a indexação no Google Imagens (fonte real de tráfego para fotos de imóvel) quanto a acessibilidade
- [x] `favoritos.html` marcada como `noindex` (lista pessoal salva no navegador de quem visita, sem conteúdo único por URL — não tem valor de busca) e removida do `sitemap.xml`
- [x] `sitemap.xml` com `priority`/`changefreq` por tipo de página
- [x] Testado: HTML servido por `curl` (sem executar JS) conferido para um imóvel real, para a busca sem filtro, com filtro "forte" (bairro+tipo+finalidade) e com filtro "fraco" (preço/quartos, que corretamente não aparece no canonical), e para um `id` inexistente/ausente (fallback); todo JSON-LD gerado (imóvel, busca, home) validado como JSON bem-formado; suíte via Playwright confirmando que a interface continua funcionando normalmente (cards, título da aba, texto alternativo das fotos) e que o painel e a API não foram afetados pela mudança.

**Limitação conhecida:** não há `og:image` funcional. As fotos dos imóveis são guardadas como base64 direto no banco (`data:image/jpeg;base64,...`), não como arquivos com uma URL própria — e `og:image` (usado pelo WhatsApp/Facebook para mostrar a miniatura no link) só aceita uma URL, não uma imagem embutida. Resolver isso de verdade exigiria passar a servir as fotos como arquivos próprios (um endpoint de imagem, ex: `/api/imoveis/:id/foto`) — uma mudança de arquitetura de armazenamento de imagem, fora do escopo de "meta tags de SEO". Fica como uma melhoria natural de uma fase futura.

**Fase 6.2 — Convite de acesso por e-mail, "esqueci minha senha" e aviso de login (a pedido, fora da numeração original do roadmap):**

Pedidos do cliente: dar acesso ao painel para vários corretores/colaboradores sem passar a senha de cada um por fora, avisar por e-mail quando alguém faz login, e ter um "esqueci minha senha" — além da lupa de mostrar/ocultar senha (já feita na Fase 6.1).

- [x] Ao cadastrar um novo usuário na aba Equipe sem definir uma senha, o sistema gera um link de convite de uso único (válido por 3 dias) e envia por e-mail — a pessoa define a própria senha, que nunca fica registrada em nenhuma caixa de entrada. O admin ainda pode, se preferir, digitar a senha na hora (comportamento antigo, sem convite)
- [x] "Esqueci minha senha" (`admin/esqueci-senha.html`) — gera um link de redefinição de uso único (válido por 1 hora); a resposta da API é sempre a mesma, exista ou não conta com aquele e-mail, para não revelar quais e-mails têm cadastro
- [x] Tela única de "definir senha" (`admin/definir-senha.html`) reaproveitada tanto para o convite quanto para a redefinição — valida o link antes de mostrar o formulário e usa a mesma lupa de mostrar/ocultar senha da Fase 6.1
- [x] Aviso por e-mail a cada login bem-sucedido (admin e corretores), com data/hora — disparado em segundo plano, sem atrasar nem arriscar o login em si
- [x] Cliente SMTP próprio (`backend/src/email.js`), sem nenhum pacote de npm — fala o protocolo SMTP diretamente sobre uma conexão TLS. Se as variáveis `SMTP_*` não estiverem configuradas, os e-mails não travam o sistema: só ficam registrados no console (suficiente para testar os fluxos em desenvolvimento local)
- [x] Testado de ponta a ponta: convite → e-mail → definir senha → login com a senha nova; "esqueci senha" com e-mail existente e inexistente (mesma resposta nos dois casos); token expirado/reutilizado corretamente rejeitado; senha curta rejeitada; criação de usuário com senha definida pelo admin continua funcionando como antes (sem convite)

**Configuração pendente:** o envio real de e-mail depende de uma senha de aplicativo do Gmail (`SMTP_PASS` em `backend/.env`, gerada em `myaccount.google.com/apppasswords` com a conta `malbimoveis@gmail.com`) — sem ela, o sistema funciona normalmente, só que os e-mails ficam só registrados no console em vez de chegar de verdade.

**Configuração feita e aceita:** o plano gratuito do Render bloqueia todas as portas de saída de SMTP — não é um bug, é uma política da própria Render. Diagnosticado nesta sessão (log de erro `ETIMEDOUT` nas tentativas de conexão) e confirmado na documentação oficial da Render. Cliente optou por manter o fallback atual (convite mostra o link direto pro admin copiar; redefinição de senha de corretor fica a cargo do admin editar manualmente) em vez de contratar um plano pago ou um serviço de e-mail terceiro — decisão revisitável no futuro se isso passar a incomodar no uso real.

**Fase 7 — Sistema de anunciantes: cadastro, planos e checkout (a pedido, fora da numeração original do roadmap):**

Pedido do cliente: ajustar o CRM pra ter uma parte de checkout, planos de anúncio, e cadastro separado pra corretor e pra imobiliária (com CRECI obrigatório pros dois, CNPJ só pra imobiliária) — inspirado no vivareal.com.br.

- [x] Novo sistema de contas de anunciante, independente do login interno do CRM (tabelas `contas`, `contas_sessions`, `planos`, `assinaturas`)
- [x] Catálogo de 6 planos: 3 pra corretor (Básico grátis, Profissional R$ 49,90, Premium R$ 99,90) e 3 pra imobiliária (Starter R$ 149,90, Business R$ 299,90, Enterprise sob consulta), cada um com limite de imóveis e lista de recursos
- [x] Cadastro separado: corretor (`cadastro-corretor.html`) e imobiliária (`cadastro-imobiliaria.html`, com CNPJ e razão social/nome fantasia) — os dois exigem CRECI
- [x] Página de planos (`planos.html`) com alternância corretor/imobiliária, carregando os planos direto da API
- [x] Login de conta de anunciante (`conta-login.html`), independente do login do painel interno
- [x] Checkout simulado (`checkout.html` + `POST /api/checkout`) — ativa a assinatura na hora, sem cobrança real; o próprio checkout já avisa isso ao anunciante. Pagamento de verdade (ex: Mercado Pago) fica pra depois, a pedido explícito do cliente ("vamos deixar por último") — a rota foi desenhada pra essa troca ser um ajuste pontual, não uma reescrita
- [x] Publicado e testado de ponta a ponta no site ao vivo: cadastro de corretor → escolha de plano → checkout → conta com plano ativo; o mesmo fluxo completo pra imobiliária; login com conta já existente

**Ressalva importante sobre a publicação:** nesta sessão descobri que o único serviço Render que existia ("portal-porto-galinhas") estava conectado a um repositório diferente — um site de turismo de Porto de Galinhas, não o Malb Imóveis. Ou seja, o Portal Malb Imóveis nunca tinha sido publicado de fato antes. Criei um novo serviço Render, corretamente conectado a este repositório, e o site está no ar em `https://malb-imoveis-portal.onrender.com`.

**Ainda falta pra esse sistema ficar utilizável de ponta a ponta** (o pedido original — checkout, planos e cadastro — está completo; os três itens abaixo, na versão essencial, foram feitos numa etapa seguinte, a pedido):

- [x] **Painel do anunciante** (`frontend/site/painel-anunciante.html`) — depois de logar, o corretor ou a imobiliária vê os próprios imóveis, quantos leads eles já geraram e o status do plano/assinatura. Contagem de visualizações e de qual canal cada visitante veio **ainda não existe** — precisaria de um sistema de rastreamento à parte, não construído ainda.
- [x] **Vínculo entre conta e imóveis** — `imoveis.conta_id` liga cada imóvel a uma conta (`contas`); editável no modal de imóvel do admin (campo "Anunciante"). Um imóvel sem conta continua sendo "imóvel próprio da Malb", como sempre foi.
- [x] **Visibilidade no painel interno (CRM)** — nova aba "Anunciantes" no `/admin`, separada da aba "Equipe" (que é login interno do CRM, sistema totalmente diferente): mostra tipo, plano, status da assinatura, quantidade de imóveis e de leads de cada conta.
- [ ] **Pagamento real** (ex: Mercado Pago, cartão, PIX) — combinado explicitamente que fica por último.

**Limitação técnica conhecida — e mais séria do que o texto anterior deste roadmap deixava claro:** o banco de dados não persiste no plano gratuito do Render. Isso não acontece só numa nova publicação — acontece **toda vez que o servidor "dorme" por inatividade e acorda de novo** (o que é o comportamento normal do plano gratuito, várias vezes por dia). Na prática: qualquer conta de anunciante, imóvel ou lead cadastrado depois do último "sono" do servidor pode sumir sozinho, sem aviso, mesmo sem nenhum deploy novo. Isso foi confirmado ao vivo nesta etapa — duas contas de teste criadas para demonstração sumiram entre uma verificação e outra, só porque o servidor ficou alguns minutos sem uso.

Resolver isso de verdade exige um banco externo (Postgres gerenciado, por exemplo) ou upgrade pro plano pago do Render (disco persistente + servidor sem "sono", a partir de ~US$ 7/mês). **Perguntei ao cliente e ele decidiu continuar no plano gratuito por enquanto** — ciente de que, nesse estado, o sistema de anunciantes serve para demonstração, não para cadastros reais de clientes (qualquer conta real cadastrada por um corretor/imobiliária de verdade pode desaparecer). Retomar essa decisão antes de divulgar o cadastro de anunciantes para o público.

## 5. Decisões pendentes (precisamos da sua confirmação)

1. **Stack técnica** — confirmar NestJS + Prisma + PostgreSQL para produção. A stack atual (Node puro + SQLite) já está pronta para produção (Fase 6), mas continua sendo uma implementação alternativa por falta de acesso ao npm no ambiente onde o projeto foi construído — a migração de framework fica pendente de um ambiente com esse acesso (ver `infra/README.md`).
2. **Domínio** — qual será o domínio do portal (ex: `malbimoveis.com.br`)? Necessário para publicar de fato (`docs/DEPLOY.md`).
3. ~~**Identidade visual**~~ — ✅ definida: logo e paleta azul/verde da Malb já aplicadas.
4. **Dados iniciais** — continuar com os imóveis de exemplo, ou já existe uma planilha/CRM para importar imóveis reais?
5. **CRM de referência para a API** — se você já usa algum CRM imobiliário hoje (ex: Vista, União, JetImóveis), me diga qual: a API da Fase 4 já está funcionando com um formato próprio (JSON e XML, documentado em `docs/API.md`), mas se o seu CRM exigir um formato específico de importação, ajusto o feed para o schema exato dele.
6. **Hospedagem** — provedor já contratado, ou segue a recomendação de `docs/DEPLOY.md` (qualquer VPS Linux comum: DigitalOcean, Hetzner, AWS Lightsail etc, ou Railway/Render se preferir algo gerenciado)? Necessário para publicar.

## 6. Próximos passos sugeridos

Com as Fases 2, 3, 4, 5 e a parte de infraestrutura da Fase 6 prontas, a ordem natural é:

1. Você testar o site, a busca, o painel do corretor (funil de leads e aba Equipe) e a aba Parceiros (CRMs) no ambiente local (`node backend/src/server.js` → `http://localhost:3001`), conferir se o mapa e o Swagger UI (`/docs.html`) carregam normalmente na sua conexão, cadastrar os corretores de verdade da imobiliária (trocando a senha do usuário demo) e apontar o que precisa ajustar.
2. Decidir domínio e hospedagem (decisões 2 e 6 acima) e seguir `docs/DEPLOY.md` para publicar de fato — o código e os artefatos de deploy já estão prontos, só falta essa parte que só você pode decidir/contratar.
3. Quando houver um ambiente de desenvolvimento com acesso normal ao npm (sua máquina, por exemplo), retomar a migração para NestJS/Prisma/PostgreSQL/Next.js (decisão 1 acima) — o modelo de dados e os contratos de API já estão prontos para isso, então é uma troca de camada, não uma reescrita.
4. Fase 7 — evolução contínua: painel do anunciante, vínculo conta-imóveis e visibilidade no CRM interno já estão prontos e publicados. Falta decidir sobre a persistência do banco (upgrade pro Render pago, ou migrar pra um Postgres gerenciado) antes de divulgar o cadastro de anunciantes pro público — ver "Limitação técnica conhecida" na seção da Fase 7 acima — e, por último, o pagamento real.
