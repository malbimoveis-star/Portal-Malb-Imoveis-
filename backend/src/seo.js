'use strict';

/**
 * SEO server-side — geração de título, meta description, canonical, Open
 * Graph, Twitter Card e dados estruturados (JSON-LD) para as páginas
 * públicas, injetados direto no HTML antes de servir.
 *
 * Por quê no servidor, e não só no JS do front (como a Fase 3 já fazia em
 * imovel.html)? Porque robôs de rede social (WhatsApp, Facebook, LinkedIn)
 * e alguns crawlers mais simples NÃO executam JavaScript — eles leem só o
 * HTML bruto da primeira resposta. Se o título/descrição/imagem certos só
 * aparecem depois de rodar JS, um link de imóvel compartilhado no WhatsApp
 * mostra uma prévia genérica em vez dos dados do imóvel. Fazendo essa troca
 * aqui no servidor (sem nenhuma dependência de npm — só string replace no
 * HTML já servido), o problema se resolve pra qualquer robô, JS ou não.
 *
 * O Googlebot moderno executa JavaScript, então já teria funcionado via JS
 * (Fase 3) — isso aqui garante que os OUTROS robôs (e o próprio Googlebot,
 * sem depender de renderizar JS) também vejam os dados certos.
 */

const VERBO = { venda: 'comprar', aluguel: 'alugar' };
const AVAILABILITY = 'https://schema.org/InStock';
const BUSINESS_FUNCTION = { venda: 'https://schema.org/Sell', aluguel: 'https://schema.org/LeaseOut' };

// Tipos de imóvel do catálogo (ver backend/data/seed-imoveis.json) mapeados
// para o subtipo mais próximo de schema.org/Accommodation. "Sala Comercial"
// e "Terreno" não têm um tipo residencial correspondente — usam "Place"
// genérico, que ainda é um schema.org válido (só menos detalhado).
const TIPO_SCHEMA = {
  Apartamento: 'Apartment',
  Studio: 'Apartment',
  Kitnet: 'Apartment',
  Cobertura: 'Apartment',
  Casa: 'House',
};

function escapeAttr(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fmtPrecoServer(preco, finalidade) {
  const valor = Number(preco).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });
  return finalidade === 'aluguel' ? `${valor}/mês` : valor;
}

/**
 * Título e descrição levam o termo de maior intenção de busca (tipo +
 * verbo + bairro/cidade) o mais perto possível do início — é o padrão que a
 * pesquisa de palavras-chave do setor imobiliário no Brasil aponta como o
 * que as pessoas de fato buscam (ex: "apartamento para alugar em
 * [bairro]"), em vez de só repetir o nome da marca.
 */
function buildImovelSeo(im, base) {
  const verbo = VERBO[im.finalidade] || 'comprar';
  const url = `${base}/imovel.html?id=${im.id}`;
  const title = `${im.titulo} para ${verbo} em ${im.bairro}, ${im.cidade} | Malb Imóveis`;
  const description = `${im.tipo} para ${verbo} em ${im.bairro}, ${im.cidade}: ${im.quartos} quarto${im.quartos === 1 ? '' : 's'}, ${im.banheiros} banheiro${im.banheiros === 1 ? '' : 's'}, ${im.area}m². ${fmtPrecoServer(im.preco, im.finalidade)}. Fale com a Malb Imóveis.`;

  const about = {
    '@type': TIPO_SCHEMA[im.tipo] || 'Place',
    name: im.titulo,
    address: {
      '@type': 'PostalAddress',
      addressLocality: im.cidade,
      addressRegion: 'SP',
      addressCountry: 'BR',
    },
  };
  if (im.quartos != null) about.numberOfRooms = im.quartos;
  if (im.banheiros != null) about.numberOfBathroomsTotal = im.banheiros;
  if (im.area != null) about.floorSize = { '@type': 'QuantitativeValue', value: im.area, unitCode: 'MTK' };
  if (im.lat != null && im.lng != null) {
    about.geo = { '@type': 'GeoCoordinates', latitude: im.lat, longitude: im.lng };
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: im.titulo,
    description: im.descricao || description,
    url,
    ...(im.createdAt ? { datePosted: im.createdAt } : {}),
    about,
    offers: {
      '@type': 'Offer',
      price: im.preco,
      priceCurrency: 'BRL',
      availability: AVAILABILITY,
      businessFunction: BUSINESS_FUNCTION[im.finalidade] || BUSINESS_FUNCTION.venda,
      url,
    },
  };

  return { title, description, url, jsonLd };
}

/**
 * Mesma lógica de palavras-chave aplicada à busca: quando a URL já tem
 * filtro de tipo/finalidade/bairro (ex: vindo de um link direto, de um
 * resultado de busca externa, ou compartilhado), a página de busca também
 * merece um título e descrição específicos — essas combinações (tipo +
 * bairro) são exatamente as páginas de cauda longa que mais convertem.
 * Filtros "soft" (preço, área, quartos, ordenação, busca livre) não entram
 * no título nem no canonical, pra não gerar uma explosão de variações quase
 * idênticas competindo entre si no índice do Google.
 */
function buildBuscaSeo(query, base) {
  const verbo = VERBO[query.finalidade];
  const temFiltro = Boolean(query.tipo || query.finalidade || query.bairro);

  let title = query.tipo ? `${query.tipo} para ${verbo || 'comprar ou alugar'}` : `Buscar imóveis para ${verbo || 'comprar ou alugar'}`;
  if (query.bairro) title += ` em ${query.bairro}`;
  title += ' | Malb Imóveis';

  let description = `Encontre ${query.tipo ? query.tipo.toLowerCase() : 'imóveis'} para ${verbo || 'comprar ou alugar'}`;
  if (query.bairro) description += ` em ${query.bairro}`;
  description += ' na Malb Imóveis. Filtre por preço, quartos e área e fale direto com o corretor.';

  const canonicalParams = new URLSearchParams();
  if (query.finalidade) canonicalParams.set('finalidade', query.finalidade);
  if (query.tipo) canonicalParams.set('tipo', query.tipo);
  if (query.bairro) canonicalParams.set('bairro', query.bairro);
  const qs = canonicalParams.toString();
  const url = `${base}/busca.html${qs ? '?' + qs : ''}`;

  const itemListElement = [
    { '@type': 'ListItem', position: 1, name: 'Início', item: `${base}/` },
    { '@type': 'ListItem', position: 2, name: 'Buscar imóveis', item: `${base}/busca.html` },
  ];
  if (query.bairro) {
    itemListElement.push({ '@type': 'ListItem', position: 3, name: query.bairro, item: url });
  }
  const jsonLd = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement };

  return { title, description, url, jsonLd, temFiltro };
}

function setTagText(html, id, texto) {
  const re = new RegExp(`(<title id="${id}"[^>]*>)[^<]*(</title>)`);
  return html.replace(re, (m, abre, fecha) => abre + escapeAttr(texto) + fecha);
}

function setMetaContent(html, id, valor) {
  const re = new RegExp(`(id="${id}"[^>]*content=")[^"]*(")`);
  return html.replace(re, (m, abre, fecha) => abre + escapeAttr(valor) + fecha);
}

function setLinkHref(html, id, valor) {
  const re = new RegExp(`(id="${id}"[^>]*href=")[^"]*(")`);
  return html.replace(re, (m, abre, fecha) => abre + escapeAttr(valor) + fecha);
}

function setJsonLd(html, id, objeto) {
  const re = new RegExp(`(<script type="application/ld\\+json" id="${id}">)[\\s\\S]*?(</script>)`);
  // JSON.stringify não escapa "</script>" — na prática não ocorre nos dados
  // deste projeto (títulos/descrições de imóveis), mas a troca abaixo evita
  // que uma string assim, se um dia existir, feche a tag do script cedo.
  const json = JSON.stringify(objeto).replace(/</g, '\\u003c');
  return html.replace(re, (m, abre, fecha) => abre + json + fecha);
}

/** Aplica título + description + canonical + OG + Twitter num HTML. */
function injectBasicSeo(html, { title, description, url }) {
  html = setTagText(html, 'seo-title', title);
  html = setMetaContent(html, 'meta-desc', description);
  html = setLinkHref(html, 'seo-canonical', url);
  html = setMetaContent(html, 'og-title', title);
  html = setMetaContent(html, 'og-desc', description);
  html = setMetaContent(html, 'og-url', url);
  html = setMetaContent(html, 'twitter-title', title);
  html = setMetaContent(html, 'twitter-desc', description);
  return html;
}

module.exports = { buildImovelSeo, buildBuscaSeo, injectBasicSeo, setJsonLd, escapeAttr };
