# API — Portal Malb Imóveis

Base URL local: `http://localhost:3001/api`

Todas as respostas são JSON. Erros seguem o formato `{ "error": "mensagem", "detalhes": [...] }` (campo `detalhes` só aparece em erros de validação).

## Autenticação

`POST /api/auth/login`

```json
// corpo da requisição
{ "email": "admin@malbimoveis.com", "senha": "malb2026" }
```
```json
// resposta 200
{ "data": { "token": "...", "user": { "id": 1, "nome": "...", "email": "...", "creci": "..." } } }
```

Use o token nas rotas protegidas: header `Authorization: Bearer <token>`. Sessões expiram em 7 dias ou até `POST /api/auth/logout`.

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
Cria um imóvel. Campos obrigatórios: `tipo`, `finalidade` (`venda`|`aluguel`), `preco`, `titulo`, `bairro`, `cidade`. Opcionais: `quartos`, `banheiros`, `vagas`, `area`, `descricao`, `amenities` (array de strings), `foto` (URL ou data URI), `lat`/`lng` (números, para exibir o mapa na página do imóvel), `status` (padrão `disponivel`).

### `PUT /api/imoveis/:id` 🔒
Atualiza um imóvel (aceita atualização parcial — os campos não enviados mantêm o valor atual).

### `DELETE /api/imoveis/:id` 🔒
Remove um imóvel. Resposta `204` sem corpo.

## Leads

### `POST /api/leads`
Público — usado pelo formulário "Enviar interesse" na página do imóvel. Campos obrigatórios: `nome`, `contato`. Opcionais: `imovelId`, `mensagem`.

### `GET /api/leads` 🔒
Lista todos os leads recebidos, mais recentes primeiro.

### `PUT /api/leads/:id` 🔒
Atualiza o `status` de um lead (`novo` | `em_atendimento` | `convertido` | `perdido`).

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
O mesmo conteúdo, em um **feed XML próprio do Portal Malb** (`Content-Type: application/xml`), com elemento raiz `<Imoveis>` e um `<Imovel>` por item (`Id`, `ReferenciaExterna`, `Tipo`, `Finalidade`, `Preco`, `Titulo`, `Bairro`, `Cidade`, `Quartos`, `Banheiros`, `Vagas`, `Area`, `Descricao`, `Amenities`/`Item`, `Foto`, `Latitude`, `Longitude`, `Status`, `AtualizadoEm`). **Importante:** este é um formato próprio, inspirado em convenções comuns de feeds do mercado imobiliário — não é uma cópia do schema proprietário de nenhum portal real (não tivemos acesso à especificação exata de nenhum concorrente ao desenhar isso).

### `GET /api/v1/parceiros/imoveis/:id`
Detalhe de um imóvel pelo ID interno da Malb (não pela `referenciaExterna` do parceiro).

### `POST /api/v1/parceiros/imoveis`
Importa (cria ou atualiza) um imóvel do parceiro no catálogo da Malb. Corpo: os mesmos campos de `POST /api/imoveis`, **mais** `referenciaExterna` (obrigatório — o ID do imóvel no sistema do parceiro).

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
| `imovel.atualizado` | O corretor muda o `status` de um imóvel `origem=parceiro` daquele parceiro, pelo painel | O imóvel completo, já com o novo `status` |
| `teste` | O parceiro chama `POST /api/v1/parceiros/webhook-teste` | `{ "mensagem": "Disparo de teste do Portal Malb Imóveis" }` |

Corpo da requisição: `{ "evento": "...", "dados": {...} }`, `Content-Type: application/json`.

**Assinatura:** todo webhook inclui o header `X-Malb-Signature: sha256=<hex>` — um HMAC-SHA256 do corpo JSON bruto (bytes exatos enviados, antes de qualquer parsing), usando o `webhookSecret` gerado junto com a chave de API do parceiro (retornado uma única vez em `POST /api/parceiros`, junto com `chaveApi`). O parceiro deve recalcular o HMAC do corpo recebido com o próprio `webhookSecret` e comparar com o header para confirmar que a requisição realmente veio da Malb — mesmo padrão usado por GitHub e Stripe.

**Limitação conhecida:** a entrega é *best-effort* — uma única tentativa, com timeout de 5s, sem fila de retry. Se o endpoint do parceiro estiver fora do ar ou responder lento no momento do disparo, a entrega falha e **não é reenviada automaticamente**. Toda tentativa (sucesso ou falha) fica registrada e pode ser consultada pelo corretor em `GET /api/parceiros/:id/entregas` ou no modal "Entregas" do painel. Uma fila de retry com backoff é uma melhoria natural para uma versão futura, mas está fora do escopo deste MVP.

## Documentação interativa

A especificação completa da API (todas as rotas acima, com schemas de request/response) está em [`openapi.yaml`](../frontend/site/openapi.yaml), servida também como arquivo estático em `/openapi.yaml`. Uma versão navegável (Swagger UI) fica disponível em `/docs.html` no site publicado.
