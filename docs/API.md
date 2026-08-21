# API — Portal Malb Imóveis (Fase 2)

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
| `status` | `all` | Autenticado: `all` mostra todos os status, ou passe um status específico |

Resposta: `{ "data": [ {...imóvel} ], "total": N }`.

### `GET /api/imoveis/:id`
Detalhe de um imóvel. `404` se não existir.

### `POST /api/imoveis` 🔒
Cria um imóvel. Campos obrigatórios: `tipo`, `finalidade` (`venda`|`aluguel`), `preco`, `titulo`, `bairro`, `cidade`. Opcionais: `quartos`, `banheiros`, `vagas`, `area`, `descricao`, `amenities` (array de strings), `foto` (URL ou data URI), `status` (padrão `disponivel`).

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

---

## Próximos passos da API (Fase 4 do roadmap — ainda não implementados)

Esta primeira versão cobre o CRUD interno (Fase 2). A **API de integração com CRMs parceiros** (import/export em XML/JSON, webhooks, autenticação de parceiros via API key, documentação OpenAPI/Swagger publicada) é escopo da Fase 4 e ainda não foi construída — o modelo de dados acima foi desenhado para suportar isso quando chegar a hora, mas os endpoints específicos de integração externa (ex: `/api/v1/parceiros/imoveis`) ainda não existem.
