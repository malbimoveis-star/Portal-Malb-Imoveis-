# API — Portal Malb Imóveis

Base URL local: `http://localhost:3001/api`

Todas as respostas são JSON. Erros seguem o formato `{ "error": "mensagem", "detalhes": [...] }` (campo `detalhes` só aparece em erros de validação).

Legenda de autenticação usada nos títulos das rotas abaixo: 🔒 = sessão de usuário interno (`/api/auth/login`, painel administrativo/corretor); 🔑 = sessão de conta de anunciante autônomo (`/api/contas/login`, painel do corretor/imobiliária autoatendimento); sem selo = rota pública, sem autenticação.

## Produção (Fase 6)

Em produção, o comportamento da API é ajustado por variáveis de ambiente (ver `backend/.env.example`, e o passo a passo de publicação em `docs/DEPLOY.md`):

- **CORS** (`ALLOWED_ORIGIN`): em desenvolvimento aceita chamadas do navegador vindas de qualquer origem (`*`); em produção, normalmente restrito ao domínio do site.
- **Rate limiting**: `POST /api/auth/login` e `POST /api/leads` (os dois únicos endpoints públicos, sem autenticação) têm limite de tentativas por IP numa janela de tempo — ver detalhes nas seções **Autenticação** e **Leads** abaixo. Ao exceder o limite, a resposta é `429 { "error": "..." }` com um cabeçalho `Retry-After` (segundos até poder tentar de novo). As demais rotas exigem sessão (`Authorization: Bearer`) ou chave de API de parceiro (`X-Api-Key`), o que já limita o abuso anônimo.
- **Cabeçalhos de segurança**: toda resposta inclui `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` e `Permissions-Policy`; `Strict-Transport-Security` é adicionado quando a conexão chega via HTTPS (atrás do proxy reverso descrito em `docs/DEPLOY.md`).

## Autenticação

`POST /api/auth/login`

```json
// corpo da requisição
{ "email": "admin@malbimoveis.com", "senha": "malb2026" }
```
```json
// resposta 200
{ "data": { "token": "...", "user": { "id": 1, "nome": "...", "email": "...", "creci": "...", "papel": "admin" } } }
```

Use o token nas rotas protegidas: header `Authorization: Bearer <token>`. Sessões expiram em 7 dias ou até `POST /api/auth/logout`.

**Rate limiting (Fase 6):** por padrão, no máximo 10 tentativas de login por IP a cada 15 minutos (ajustável via `RATE_LIMIT_LOGIN_MAX`/`RATE_LIMIT_LOGIN_WINDOW_MS`). Passou do limite → `429`.

Desde a Fase 5, cada usuário tem um `papel` (`admin` ou `corretor`) e um `ativo`. Um usuário desativado não consegue logar — e se for desativado enquanto já está logado, a sessão dele para de valer na próxima requisição (não precisa esperar o token de 7 dias expirar). Só `admin` pode gerenciar a equipe (ver **Equipe** abaixo); `corretor` pode ver a lista de colegas, atender leads e ver/editar imóveis normalmente.

**Aviso de login por e-mail (Fase 6.2):** todo login bem-sucedido dispara um e-mail para o usuário avisando que houve um acesso, com data/hora. O envio acontece em segundo plano — nunca atrasa nem falha a resposta do login, mesmo se o e-mail não puder ser enviado.

### `POST /api/auth/esqueci-senha`

```json
// corpo da requisição
{ "email": "alguem@exemplo.com" }
```
```json
// resposta 200 (sempre a mesma, exista ou não o e-mail)
{ "data": { "mensagem": "Se esse e-mail estiver cadastrado, enviamos um link para redefinir a senha." } }
```

Se o e-mail existir e a conta estiver ativa, gera um token de redefinição de uso único (válido por 1 hora) e envia por e-mail um link para `/admin/definir-senha.html?token=...`. A resposta é idêntica nos dois casos de propósito, para não revelar quais e-mails têm cadastro no sistema.

### `GET /api/auth/token/:token`
Valida um token de convite ou de redefinição de senha, antes de mostrar o formulário de nova senha. `404` se o token não existir, já tiver sido usado ou estiver expirado. Resposta: `{ "data": { "tipo": "convite" | "redefinicao", "nome", "email" } }`.

### `POST /api/auth/definir-senha`

```json
// corpo da requisição
{ "token": "...", "senha": "novaSenha123" }
```

Define a senha da conta associada ao token (mín. 6 caracteres) e marca o token como usado — não pode ser reaproveitado. `400` se o token for inválido/expirado/já usado ou a senha for curta demais. Ao ser usado, também derruba qualquer sessão antiga daquela conta, por segurança.

## Imóveis

### `GET /api/imoveis`
Lista imóveis. Sem autenticação, só retorna imóveis com `status=disponivel`.

Filtros via query string (todos opcionais, combináveis):

| Parâmetro | Exemplo | Efeito |
|---|---|---|
| `finalidade` | `venda` ou `aluguel` | Filtra por finalidade |
| `tipo` | `Apartamento` | Filtra por tipo exato |
| `cidade` | `São Paulo` | Filtra por cidade exata |
| `bairro` | `Itaim Bibi` | Filtra por bairro exato |
| `q` | `metrô` | Busca livre em título/bairro/cidade |
| `quartosMin` | `2` | Quartos maior ou igual a |
| `precoMax` | `800000` | Preço menor ou igual a |
| `areaMin` | `80` | Área maior ou igual a (m²) |
| `areaMax` | `300` | Área menor ou igual a (m²) |
| `orderBy` | `preco_asc` | Ordenação: `recentes` (padrão), `preco_asc`, `preco_desc`, `area_desc` |
| `status` | `all` | Autenticado: `all` mostra todos os status, ou passe um status específico |

Resposta: `{ "data": [ {...imóvel} ], "total": N }`. Cada imóvel inclui `lat`/`lng` (podem ser `null` quando a localização exata não foi cadastrada) — usados para o mapa na página de detalhe. Desde a Fase 4, cada imóvel também inclui `origem` (`proprio` ou `parceiro`), `parceiroId` e `referenciaExterna` — ver seção **API de parceiros** abaixo.

### `GET /api/imoveis/:id`
Detalhe de um imóvel. `404` se não existir.

### `POST /api/imoveis` 🔒
Cria um imóvel. Campos obrigatórios: `tipo`, `finalidade` (`venda`|`aluguel`), `preco`, `titulo`, `bairro`, `cidade`.

Opcionais — bloco básico: `quartos`, `banheiros`, `vagas`, `area` (m², área total/construída), `descricao`, `amenities` (array de strings), `lat`/`lng` (números, para exibir o mapa na página do imóvel), `status` (padrão `disponivel`).

Opcionais — bloco de características (Fase 7, alinhado ao cadastro estilo CRM de imobiliária):
- `suites` (inteiro — quantos dos `quartos` são suíte), `lavabos` (inteiro).
- `vagasCobertas` e `vagasDescobertas` (inteiros). Se enviados, `vagas` é calculado automaticamente como a soma dos dois; se só `vagas` for enviado, ele é usado como está.
- `areaUtil` (m², área privativa — opcional, diferente de `area`).
- `anoConstrucao` (inteiro, opcional).

Opcionais — bloco de localização detalhada: `endereco`, `numero`, `complemento`, `cep` (todos texto — complementam `bairro`/`cidade`, que continuam obrigatórios).

Opcionais — bloco financeiro: `condominio` (valor mensal, R$), `iptu` (valor anual, R$).

Opcionais — fotos: `foto` (URL ou data URI — foto de capa, mantido por compatibilidade) e/ou `fotos` (array de URLs/data URIs — galeria completa; a primeira posição é a capa). Envie um dos dois ou os dois — se só `fotos` for enviado, `foto` é preenchido automaticamente com a primeira posição; se só `foto` for enviado, ele também aparece como a única entrada de `fotos`.

O catálogo de `amenities` é livre (qualquer string), mas o painel organiza as chaves conhecidas em 4 categorias (Característica do imóvel, Instalação e segurança, Acabamento, Lazer) com ícone — ex.: `piscina`, `churrasqueira`, `academia`, `playground`, `elevador`, `portao_eletronico`, `mobiliado`, `vista_mar`. Chaves fora do catálogo continuam aceitas e exibidas como texto simples.

### `PUT /api/imoveis/:id` 🔒
Atualiza um imóvel (aceita atualização parcial — os campos não enviados mantêm o valor atual). Aceita todos os campos de `POST /api/imoveis` acima.

### `DELETE /api/imoveis/:id` 🔒
Remove um imóvel. Resposta `204` sem corpo.

## Autoatendimento — imóveis da conta (`/api/contas/me/imoveis`) 🔑

Rotas usadas pelo painel do corretor/imobiliária autônomo (`painel-anunciante.html`) para o próprio anunciante cadastrar, editar e excluir os imóveis dele — sem depender do painel administrativo. Autenticação por sessão de **conta** (`Authorization: Bearer <token de conta>`, obtido em `POST /api/contas/login`), diferente da sessão de usuário interno usada nas demais rotas 🔒 deste documento. Cada imóvel criado por aqui é automaticamente vinculado à conta autenticada (`conta_id`) e só aparece/pode ser editado por ela.

### `POST /api/contas/me/imoveis` 🔑
Cria um imóvel para a conta autenticada. Mesmo corpo de `POST /api/imoveis` (ver campos acima). Duas travas antes de criar:
- `403` se a conta não tiver plano com `status_assinatura = "ativa"` — mensagem orienta a escolher um plano em `/planos.html`.
- `403` se o plano tiver `limite_anuncios` definido e a conta já tiver atingido esse número de imóveis cadastrados (contagem própria, não conta imóveis de outras contas).

### `PUT /api/contas/me/imoveis/:id` 🔑
Atualiza um imóvel — mesmas regras de atualização parcial de `PUT /api/imoveis/:id`. `404` se o imóvel não existir ou não pertencer à conta autenticada (nunca revela que o imóvel existe e é de outra conta).

### `DELETE /api/contas/me/imoveis/:id` 🔑
Remove um imóvel da conta autenticada. `404` nas mesmas condições do `PUT` acima. Resposta `204` sem corpo.

## Leads

O funil de atendimento (Fase 5) vive nestas rotas: todo lead tem um `status` (`novo` | `em_atendimento` | `convertido` | `perdido`) e pode ser atribuído a um `corretorId`. Cada mudança relevante — recebimento, troca de status, atribuição, e notas manuais do corretor — fica registrada na linha do tempo do lead (`lead_interacoes`), consultável em `GET /api/leads/:id/interacoes`.

### `POST /api/leads`
Público — usado pelo formulário "Enviar interesse" na página do imóvel. Campos obrigatórios: `nome`, `contato`. Opcionais: `imovelId`, `mensagem`. Ao ser criado, o lead já ganha uma primeira entrada na timeline (`tipo: "sistema"`, "Lead recebido pelo site.").

**Rate limiting (Fase 6):** por padrão, no máximo 20 leads por IP a cada hora (ajustável via `RATE_LIMIT_LEAD_MAX`/`RATE_LIMIT_LEAD_WINDOW_MS`) — protege contra spam automatizado no formulário público. Passou do limite → `429`.

### `GET /api/leads` 🔒
Lista leads, mais recentes primeiro. Filtros opcionais via query string: `status` (um dos quatro valores do funil) e `corretorId` (leads atribuídos a um corretor específico) — usados pelo funil Kanban do painel.

### `GET /api/leads/:id` 🔒
Detalhe de um lead. `404` se não existir.

### `PUT /api/leads/:id` 🔒
Atualização parcial: aceita `status` e/ou `corretorId` (número para atribuir, `null` para remover a atribuição; campo omitido não mexe no valor atual). `corretorId` precisa ser de um usuário `ativo`, senão `400`. Cada mudança de `status` ou de `corretorId` é automaticamente registrada na timeline do lead, atribuída a quem fez a chamada (o `user` autenticado). Se o lead é de um imóvel de parceiro (Fase 4) e o `status` muda, o parceiro recebe um webhook `lead.atualizado` — ver **Webhooks** em Parceiros.

### `GET /api/leads/:id/interacoes` 🔒
Linha do tempo do lead, mais antiga primeiro: `{ "data": [ { "id", "leadId", "userId", "userNome", "tipo", "texto", "createdAt" } ], "total": N }`. `tipo` é um de `sistema` (lead recebido), `status` (mudança de status), `atribuicao` (corretor atribuído/removido) ou `nota` (anotação manual). `userNome` é `null` para entradas do sistema.

### `POST /api/leads/:id/interacoes` 🔒
Registra uma nota manual do corretor (ex: "liguei, vai confirmar até amanhã"). Corpo: `{ "texto": "..." }`. Sempre entra como `tipo: "nota"`, atribuída ao usuário autenticado.

## Equipe (`/api/usuarios`) 🔒

Gestão de quem tem login no painel — Fase 5. `GET` é liberado pra qualquer usuário autenticado (precisa disso pra montar o seletor de corretor ao atribuir um lead); `POST`, `PUT` e `DELETE` exigem `papel: "admin"` — um corretor comum recebe `403` se tentar.

### `GET /api/usuarios` 🔒
Lista a equipe: `{ "data": [ { "id", "nome", "email", "creci", "papel", "ativo", "createdAt" } ], "total": N }`. Nunca inclui hash de senha.

### `POST /api/usuarios` 🔒 (admin)
Cria um novo login. Corpo: `{ "nome", "email", "senha" (opcional, mín. 6 caracteres se enviada), "creci" (opcional), "papel" (opcional, `"corretor"` por padrão) }`. `409` se o e-mail já estiver em uso.

**Convite por e-mail (Fase 6.2):** se `senha` não for enviada, a conta é criada sem senha utilizável e um convite de acesso é mandado por e-mail (link de uso único, válido por 3 dias, para `/admin/definir-senha.html`) — a pessoa escolhe a própria senha. A resposta inclui `convite: { link, enviado }` nesse caso (`null` quando o admin definiu a senha na hora). O `link` também vem sempre na resposta, mesmo quando o e-mail foi enviado com sucesso — serve de reforço caso o admin precise repassar manualmente.

### `PUT /api/usuarios/:id` 🔒 (admin)
Atualização parcial: `nome`, `email`, `creci`, `papel`, `ativo`, `senha` (opcional — só troca se enviada). Desativar um usuário (`ativo: false`) derruba as sessões dele na hora. Há uma trava de segurança: não é possível rebaixar de `admin` para `corretor` nem desativar o **último** admin ativo do sistema — a chamada retorna `400` para proteger o painel de ficar sem ninguém com acesso total.

### `DELETE /api/usuarios/:id` 🔒 (admin)
Exclui o usuário. `400` se for o próprio usuário autenticado (não dá pra se autoexcluir) ou se for o último admin ativo — mesma trava do `PUT`. Leads atribuídos a esse usuário ficam sem corretor responsável (`corretorId: null`), não são apagados.

## Health check

`GET /api/health` → `{ "status": "ok", "timestamp": "..." }` — sem autenticação, útil para monitoramento.

## SEO

`GET /sitemap.xml` — gerado dinamicamente a partir dos imóveis com `status=disponivel`, com a home, a busca, os favoritos e a URL de cada imóvel. `GET /robots.txt` — libera indexação do site público e bloqueia `/admin/`.

---

## Gestão de parceiros (painel) 🔒

Rotas usadas pelo corretor no painel, aba **Parceiros (CRMs)**, para administrar os CRMs parceiros que integram via API. Todas exigem sessão (`Authorization: Bearer <token>`), como as demais rotas do painel.

### `GET /api/parceiros` 🔒
Lista os parceiros cadastrados, com `imoveisImportados` (contagem de imóveis com aquele `parceiroId`).

### `POST /api/parceiros` 🔒
Cria um parceiro. Corpo: `{ "nome": "...", "webhookUrl": "https://... (opcional)" }`. A resposta inclui `chaveApi` — a chave de API em **texto puro**, que só aparece nesta resposta. Ela não fica salva em texto puro no banco (só um hash SHA-256) e não pode ser recuperada depois — se for perdida, é preciso gerar uma nova.

### `PUT /api/parceiros/:id` 🔒
Atualiza `nome`, `webhookUrl` e/ou `ativo` (desativar suspende a chave sem excluir o parceiro nem apagar o histórico).

### `POST /api/parceiros/:id/regenerar-chave` 🔒
Gera uma nova chave de API para o parceiro (a antiga para de funcionar imediatamente). Resposta inclui `chaveApi` em texto puro, mesma regra do `POST /api/parceiros`.

### `DELETE /api/parceiros/:id` 🔒
Exclui o parceiro. A chave de API para de funcionar e o histórico de entregas de webhook é apagado. Os imóveis que ele já havia importado **continuam no catálogo** (ficam com `origem=parceiro` associada a um `parceiroId` que não existe mais).

### `GET /api/parceiros/:id/entregas` 🔒
Retorna as últimas 50 entregas de webhook registradas para aquele parceiro (`evento`, `sucesso`, `statusHttp`, `erro`, `createdAt`) — usado pelo modal "Entregas" no painel para dar visibilidade se os webhooks estão realmente chegando.

## API de parceiros (`/api/v1/parceiros/*`)

Esta é a superfície pública que um CRM parceiro consome para importar/exportar imóveis e receber webhooks — a integração da Fase 4 do roadmap. Diferente das demais rotas (que usam sessão de corretor), aqui a autenticação é por **chave de API**, enviada no header `X-Api-Key`. A chave é gerada uma vez pelo corretor no painel (`POST /api/parceiros`) e entregue ao parceiro fora de banda.

O prefixo `v1` é proposital: como é um contrato com terceiros, mudanças que quebrem compatibilidade virão numa `v2` — a `v1` continua funcionando. As demais rotas internas do painel podem mudar livremente, sem esse compromisso.

Toda rota abaixo responde `401 { "error": "Chave de API ausente ou inválida (header X-Api-Key)" }` se a chave faltar, estiver errada, ou pertencer a um parceiro desativado (`ativo=false`).

### `GET /api/v1/parceiros/imoveis`
Exporta os imóveis da Malb com `status=disponivel`, em JSON — para o parceiro publicar no site/CRM dele. Resposta: `{ "data": [ {...imóvel} ], "total": N }`.

### `GET /api/v1/parceiros/imoveis.xml`
O mesmo conteúdo, em um **feed XML próprio do Portal Malb** (`Content-Type: application/xml`), com elemento raiz `<Imoveis>` e um `<Imovel>` por item: `Id`, `ReferenciaExterna`, `Tipo`, `Finalidade`, `Preco`, `Titulo`, `Bairro`, `Cidade`, `Endereco`, `Numero`, `Complemento`, `Cep`, `Quartos`, `Suites`, `Banheiros`, `Lavabos`, `Vagas`, `VagasCobertas`, `VagasDescobertas`, `Area`, `AreaUtil`, `AnoConstrucao`, `Condominio`, `Iptu`, `Descricao`, `Amenities`/`Item`, `Fotos`/`Item` (cada `<Item>` traz o atributo `principal="true"` na primeira posição/capa), `Foto` (mantido por compatibilidade, igual à primeira foto), `Latitude`, `Longitude`, `Status`, `AtualizadoEm`. **Importante:** este é um formato próprio, inspirado em convenções comuns de feeds do mercado imobiliário (o mesmo vocabulário de campos usado no cadastro de `POST /api/v1/parceiros/imoveis` abaixo) — não é uma cópia do schema proprietário de nenhum portal real.

### `GET /api/v1/parceiros/imoveis/:id`
Detalhe de um imóvel pelo ID interno da Malb (não pela `referenciaExterna` do parceiro). Traz o mesmo conjunto completo de campos descrito em `POST /api/imoveis` (bloco básico + características + localização + financeiro + fotos).

### `POST /api/v1/parceiros/imoveis`
Importa (cria ou atualiza) um imóvel do parceiro no catálogo da Malb. Corpo: os mesmos campos de `POST /api/imoveis` (ver bloco completo — tipo/finalidade/preço/título/bairro/cidade obrigatórios; quartos/suites/banheiros/lavabos/vagas(Cobertas/Descobertas)/area/areaUtil/anoConstrucao/descricao/amenities/endereco/numero/complemento/cep/condominio/iptu/foto/fotos/lat/lng/status opcionais), **mais** `referenciaExterna` (obrigatório — o ID do imóvel no sistema do parceiro). Este é o endpoint pensado para uma integração como a do CRM Code 49: a cada novo imóvel ou atualização no CRM parceiro, ele faz `POST` aqui com o payload completo do imóvel e a própria `referenciaExterna` (o ID dele) para manter o catálogo da Malb sincronizado.

A chave de upsert é `(parceiro_id, referenciaExterna)`: reenviar com a mesma `referenciaExterna` **atualiza** o imóvel existente (resposta `200`) em vez de criar um duplicado; uma referência nova **cria** (resposta `201`). Isso permite ao parceiro rodar uma sincronização periódica sem se preocupar em rastrear IDs internos da Malb.

Imóveis importados ficam marcados com `origem="parceiro"` e aparecem no painel do corretor com o selo "via parceiro" — o corretor pode ver e alterar o status deles, mas a edição completa (dados do imóvel) é feita pelo parceiro via API, não pelo painel.

### `DELETE /api/v1/parceiros/imoveis/:referenciaExterna`
Remove um imóvel importado, identificado pela `referenciaExterna` do parceiro (não pelo ID interno da Malb). `404` se não existir um imóvel daquele parceiro com essa referência.

### `POST /api/v1/parceiros/webhook-teste`
Dispara manualmente um evento `teste` para a `webhookUrl` cadastrada do parceiro, com a mesma assinatura HMAC dos eventos reais — útil para o parceiro validar a integração antes de ir para produção. `400` se o parceiro não tiver `webhookUrl` cadastrada.

## Webhooks

Quando cadastra uma `webhookUrl`, o parceiro passa a receber `POST`s automáticos da Malb nestes eventos:

| Evento | Quando dispara | `dados` do payload |
|---|---|---|
| `lead.criado` | Alguém envia o formulário de interesse (`POST /api/leads`) para um imóvel com `origem=parceiro` do parceiro | O lead, mais `imovelReferenciaExterna` e `imovelTitulo` |
| `lead.atualizado` | O corretor muda o `status` de um lead (`PUT /api/leads/:id`) sobre um imóvel `origem=parceiro` daquele parceiro — parte do funil de atendimento da Fase 5 | O lead completo, já com o novo `status`, mais `imovelReferenciaExterna` |
| `imovel.atualizado` | O corretor muda o `status` de um imóvel `origem=parceiro` daquele parceiro, pelo painel | O imóvel completo, já com o novo `status` |
| `teste` | O parceiro chama `POST /api/v1/parceiros/webhook-teste` | `{ "mensagem": "Disparo de teste do Portal Malb Imóveis" }` |

Corpo da requisição: `{ "evento": "...", "dados": {...} }`, `Content-Type: application/json`.

**Assinatura:** todo webhook inclui o header `X-Malb-Signature: sha256=<hex>` — um HMAC-SHA256 do corpo JSON bruto (bytes exatos enviados, antes de qualquer parsing), usando o `webhookSecret` gerado junto com a chave de API do parceiro (retornado uma única vez em `POST /api/parceiros`, junto com `chaveApi`). O parceiro deve recalcular o HMAC do corpo recebido com o próprio `webhookSecret` e comparar com o header para confirmar que a requisição realmente veio da Malb — mesmo padrão usado por GitHub e Stripe.

**Limitação conhecida:** a entrega é *best-effort* — uma única tentativa, com timeout de 5s, sem fila de retry. Se o endpoint do parceiro estiver fora do ar ou responder lento no momento do disparo, a entrega falha e **não é reenviada automaticamente**. Toda tentativa (sucesso ou falha) fica registrada e pode ser consultada pelo corretor em `GET /api/parceiros/:id/entregas` ou no modal "Entregas" do painel. Uma fila de retry com backoff é uma melhoria natural para uma versão futura, mas está fora do escopo deste MVP.

## Documentação interativa

A especificação completa da API (todas as rotas acima, com schemas de request/response) está em [`openapi.yaml`](../frontend/site/openapi.yaml), servida também como arquivo estático em `/openapi.yaml`. Uma versão navegável (Swagger UI) fica disponível em `/docs.html` no site publicado.
