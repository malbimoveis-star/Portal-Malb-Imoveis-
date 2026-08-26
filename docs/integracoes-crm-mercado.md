# Varredura de integrações de CRMs imobiliários (mercado brasileiro)

> Pesquisa feita para entender como os principais CRMs/sistemas de imobiliária do
> mercado brasileiro entregam imóveis a portais de anúncio — não só o CRM 49
> (Infinity Negócios Imobiliários), que é a referência direta do primeiro parceiro
> do Malb, mas o padrão geral do setor. Objetivo: garantir que a API de parceiros
> do Malb (`/api/v1/parceiros/imoveis`, ver `docs/API.md`) seja compatível com o
> maior número possível de CRMs, não só com o formato específico de um deles.

## Os três padrões de integração encontrados

Praticamente todo CRM imobiliário brasileiro entrega imóveis a um portal por um
destes três caminhos (alguns suportam mais de um):

### 1. Feed XML "puxado" pelo portal (padrão VRSync)

O CRM publica um arquivo XML num link público e fixo (ex:
`https://crm-do-parceiro.com/feed/imoveis.xml`); o portal busca esse arquivo
periodicamente (de hora em hora, por exemplo) e reprocessa a lista inteira a
cada busca. Quem não está mais no XML é considerado removido/inativo.

Esse é o modelo usado pelo Grupo OLX (ZAP Imóveis + VivaReal) e virou um padrão
de fato do mercado: o formato **VRSync** (o antigo formato "ZAP" está em
descontinuação desde 2024). A estrutura é, resumidamente:

```xml
<ListingDataFeed xmlns="http://www.vivareal.com/schemas/1.0/VRSync">
  <Header>
    <Provider>Nome do provedor do feed</Provider>
    <Email>contato@crm.com.br</Email>
    <PublishDate>2026-08-26T14:00:00</PublishDate>
  </Header>
  <Listings>
    <Listing>
      <ListingID>Imovel-01</ListingID>
      <Title>...</Title>
      <TransactionType>For Sale</TransactionType>
      <Media>
        <Item medium="image" caption="foto 1" primary="true">https://.../foto1.jpg</Item>
      </Media>
      <Details>
        <PropertyType>Residential / Apartment</PropertyType>
        <Description><![CDATA[...]]></Description>
        <ListPrice currency="BRL">860000</ListPrice>
        <LivingArea unit="square metres">80</LivingArea>
        <Bedrooms>2</Bedrooms>
        <Bathrooms>1</Bathrooms>
        <Suites>1</Suites>
        <Garage type="Parking Space">2</Garage>
        <PropertyAdministrationFee currency="BRL">980</PropertyAdministrationFee>
        <Features><Feature>Piscina</Feature></Features>
      </Details>
      <Location>
        <State abbreviation="SP">Sao Paulo</State>
        <City>São Paulo</City>
        <Neighborhood>...</Neighborhood>
        <Address>...</Address>
        <StreetNumber>539</StreetNumber>
        <PostalCode>01415-003</PostalCode>
        <Latitude>-23.5531131</Latitude>
        <Longitude>-46.659864</Longitude>
      </Location>
    </Listing>
  </Listings>
</ListingDataFeed>
```

Praticamente qualquer CRM do mercado (Vista, Jetimob, CV CRM, Imoview e dezenas
de outros menores) consegue gerar um feed nesse formato ou em algo muito
parecido, porque é o que ZAP/VivaReal exigem deles. **É o "menor denominador
comum" do setor.**

**Onde o Malb já está alinhado:** nosso feed de saída
(`GET /api/v1/parceiros/imoveis.xml`, documentado em `docs/API.md`) já segue essa
mesma lógica de XML com um item por imóvel — não é o VRSync literal, mas é do
mesmo estilo, então adaptar para VRSync (se algum dia o Malb precisar alimentar
o ZAP/VivaReal com os imóveis dos nossos anunciantes) é um ajuste de formato, não
de arquitetura.

**Gap identificado:** hoje o Malb só *publica* um feed XML (saída). Não temos um
jeito de *consumir* o feed XML de um parceiro (entrada) — ou seja, se um CRM só
sabe gerar um link de feed VRSync e não sabe fazer POST para uma API externa, hoje
ele não consegue se integrar com a gente. Ver recomendação no final.

### 2. API REST "puxada" pelo portal (o portal consulta o CRM)

O CRM expõe endpoints REST com autenticação por chave de API, e quem quer os
dados faz a consulta (não é o CRM que empurra nada). Exemplo real: a
**Vista Software** (`vistasoft.com.br`), um dos CRMs mais usados no Brasil —
autenticação por `?key=...` na query string, endpoints como `/imoveis/listar`,
`/imoveis/detalhes`, `/imoveis/fotos`, `/clientes/lead`. Sem menção a webhooks
na documentação pública: é tudo sob demanda.

Esse modelo é mais raro em integrações CRM→portal (é mais comum em
site-imobiliário→CRM, tipo "meu site consulta o Vista pra listar os imóveis"),
mas caso apareça um parceiro assim, o Malb precisaria rodar uma rotina
periódica que consulta a API do parceiro e importa/atualiza os imóveis — o
inverso do fluxo do CRM 49.

### 3. Webhook / POST "empurrado" pelo CRM (o CRM avisa o portal)

O CRM dispara uma requisição HTTP (quase sempre `POST` com corpo JSON) para uma
URL cadastrada no momento em que algo acontece — novo lead, imóvel novo,
mudança de status, negócio fechado. É o modelo mais próximo de tempo real e é
o que **CRM 49/Infinity**, **Jetimob** (eventos de lead e negociação) e
**CV CRM** oferecem.

**É exatamente o modelo que o Malb já implementa** dos dois lados:
- **Entrada** (`POST /api/v1/parceiros/imoveis`): o parceiro nos envia o imóvel
  completo a cada criação/atualização, com a própria `referenciaExterna` dele.
  Isso é o que o CRM 49 vai usar.
- **Saída** (webhook cadastrado por parceiro, ver aba "Parceiros" do painel):
  avisamos o parceiro quando um lead chega ou muda de status.

## CRMs/plataformas pesquisados

| CRM / plataforma | Modelo de integração | Observação |
|---|---|---|
| CRM 49 (Infinity Negócios Imobiliários) | Push (POST) | Referência direta do primeiro parceiro; é o motivo do design atual da API |
| Grupo OLX — ZAP Imóveis / VivaReal | Feed XML puxado (padrão VRSync) | Padrão de fato do mercado; "ZAP" (formato antigo) descontinuado desde 2024 |
| Vista Software | API REST puxada (chave na query string) | Um dos CRMs mais populares do Brasil; sem webhooks documentados publicamente |
| Jetimob | Webhook (push) + integrações prontas com portais | Eventos: lead criado, negociação ganha/perdida, permuta compatível |
| CV CRM (Construtor de Vendas) | Webhook (push) | Focado em incorporadoras/lançamentos, não só revenda |

## Recomendação

O design atual da API de parceiros do Malb (push via `POST`, com chave de API
por parceiro e webhook de saída) já cobre o padrão mais comum entre CRMs que
fazem integração direta com um portal (categoria 3 acima) — inclusive o CRM 49,
que é quem vai integrar primeiro.

Para o Malb aceitar também parceiros que só sabem gerar um feed XML no padrão
VRSync (categoria 1 — que é, na prática, o "menor denominador comum" do
mercado, já que quase todo CRM sabe gerar isso por causa da ZAP/VivaReal), a
melhoria futura seria: no cadastro de parceiro (aba "Parceiros" do painel),
permitir informar uma **URL de feed XML** em vez de (ou além de) uma chave de
API, e o backend rodar uma importação periódica que baixa, faz parse do XML no
formato VRSync e faz o upsert dos imóveis do jeito que já fazemos hoje com o
payload JSON do CRM 49 — mudando só a fonte do dado (arquivo XML puxado, ao
invés de POST recebido). Isso não está implementado ainda; é uma extensão
natural do que já existe, não uma reescrita.

Fontes consultadas: documentação pública do Grupo OLX/ZAP (developers.grupozap.com),
Vista Software, Jetimob e CV CRM, além de comparativos de mercado (Colibex,
Imobisoft, Website Imobiliário, ImoFlow) — pesquisa feita em 26/08/2026.
