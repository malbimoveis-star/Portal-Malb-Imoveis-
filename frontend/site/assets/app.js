/* Portal Malb Imóveis — helpers compartilhados do site real (Fase 2).
   Fala com a API em ../../backend (mesma origem — o backend serve estes
   arquivos estáticos, então os caminhos abaixo são relativos, sem CORS). */

const API_BASE = '/api';

function fmtPreco(valor, finalidade) {
  const s = 'R$ ' + Number(valor).toLocaleString('pt-BR');
  return finalidade === 'aluguel' ? s : s;
}

/* SEO — Fase 6.1. O servidor (backend/src/seo.js) já injeta o título, a
   description, o canonical, Open Graph, Twitter Card e o JSON-LD certos no
   HTML antes de servir a página (o que garante que robôs que não executam
   JavaScript — como o crawler de prévia de link do WhatsApp — também vejam
   os dados corretos). O que está aqui é a mesma lógica, em espelho, do lado
   do navegador: garante consistência se a página for aberta sem passar pelo
   servidor (ex: um outro host estático servindo só o front) e mantém o
   comportamento já testado desde a Fase 3 de atualizar o título ao carregar
   os dados do imóvel via API. */
const VERBO_FINALIDADE = { venda: 'comprar', aluguel: 'alugar' };
const TIPO_SCHEMA = { Apartamento: 'Apartment', Studio: 'Apartment', Kitnet: 'Apartment', Cobertura: 'Apartment', Casa: 'House' };

function setMetaConteudo(id, valor) {
  const el = document.getElementById(id);
  if (el) el.setAttribute(el.tagName === 'LINK' ? 'href' : 'content', valor);
}

function setJsonLd(id, objeto) {
  const el = document.getElementById(id);
  if (el) el.textContent = JSON.stringify(objeto);
}

function aplicarSeoBusca(estado) {
  const verbo = VERBO_FINALIDADE[estado.finalidade];
  let titulo = estado.tipo ? `${estado.tipo} para ${verbo || 'comprar ou alugar'}` : `Buscar imóveis para ${verbo || 'comprar ou alugar'}`;
  if (estado.bairro) titulo += ` em ${estado.bairro}`;
  titulo += ' | Malb Imóveis';

  let descricao = `Encontre ${estado.tipo ? estado.tipo.toLowerCase() : 'imóveis'} para ${verbo || 'comprar ou alugar'}`;
  if (estado.bairro) descricao += ` em ${estado.bairro}`;
  descricao += ' na Malb Imóveis. Filtre por preço, quartos e área e fale direto com o corretor.';

  const params = new URLSearchParams();
  if (estado.finalidade) params.set('finalidade', estado.finalidade);
  if (estado.tipo) params.set('tipo', estado.tipo);
  if (estado.bairro) params.set('bairro', estado.bairro);
  const qs = params.toString();
  const url = window.location.origin + '/busca.html' + (qs ? '?' + qs : '');

  document.title = titulo;
  setMetaConteudo('meta-desc', descricao);
  setMetaConteudo('seo-canonical', url);
  setMetaConteudo('og-title', titulo);
  setMetaConteudo('og-desc', descricao);
  setMetaConteudo('og-url', url);
  setMetaConteudo('twitter-title', titulo);
  setMetaConteudo('twitter-desc', descricao);

  const itemListElement = [
    { '@type': 'ListItem', position: 1, name: 'Início', item: window.location.origin + '/' },
    { '@type': 'ListItem', position: 2, name: 'Buscar imóveis', item: window.location.origin + '/busca.html' },
  ];
  if (estado.bairro) itemListElement.push({ '@type': 'ListItem', position: 3, name: estado.bairro, item: url });
  setJsonLd('ld-json', { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement });
}

function aplicarSeoImovel(im) {
  const verbo = VERBO_FINALIDADE[im.finalidade] || 'comprar';
  const url = window.location.origin + '/imovel.html?id=' + im.id;
  const titulo = `${im.titulo} para ${verbo} em ${im.bairro}, ${im.cidade} | Malb Imóveis`;
  const descricao = `${im.tipo} para ${verbo} em ${im.bairro}, ${im.cidade}: ${im.quartos} quarto${im.quartos === 1 ? '' : 's'}, ${im.banheiros} banheiro${im.banheiros === 1 ? '' : 's'}, ${im.area}m². ${fmtPreco(im.preco, im.finalidade)}${im.finalidade === 'aluguel' ? '/mês' : ''}. Fale com a Malb Imóveis.`;

  document.title = titulo;
  setMetaConteudo('meta-desc', descricao);
  setMetaConteudo('seo-canonical', url);
  setMetaConteudo('og-title', titulo);
  setMetaConteudo('og-desc', descricao);
  setMetaConteudo('og-url', url);
  setMetaConteudo('twitter-title', titulo);
  setMetaConteudo('twitter-desc', descricao);

  const about = {
    '@type': TIPO_SCHEMA[im.tipo] || 'Place',
    name: im.titulo,
    address: { '@type': 'PostalAddress', addressLocality: im.cidade, addressRegion: 'SP', addressCountry: 'BR' },
    numberOfRooms: im.quartos,
    numberOfBathroomsTotal: im.banheiros,
    floorSize: { '@type': 'QuantitativeValue', value: im.area, unitCode: 'MTK' },
  };
  if (im.lat != null && im.lng != null) about.geo = { '@type': 'GeoCoordinates', latitude: im.lat, longitude: im.lng };
  setJsonLd('ld-json', {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: im.titulo,
    description: im.descricao || descricao,
    url,
    about,
    offers: {
      '@type': 'Offer',
      price: im.preco,
      priceCurrency: 'BRL',
      availability: 'https://schema.org/InStock',
      businessFunction: im.finalidade === 'aluguel' ? 'https://schema.org/LeaseOut' : 'https://schema.org/Sell',
      url,
    },
  });
}

function getToken() {
  try { return localStorage.getItem('malb_admin_token'); } catch { return null; }
}
function setToken(token) {
  try { localStorage.setItem('malb_admin_token', token); } catch {}
}
function clearToken() {
  try { localStorage.removeItem('malb_admin_token'); } catch {}
}

function getContaToken() {
  try { return localStorage.getItem('malb_conta_token'); } catch { return null; }
}
function setContaToken(token) {
  try { localStorage.setItem('malb_conta_token', token); } catch {}
}
function clearContaToken() {
  try { localStorage.removeItem('malb_conta_token'); } catch {}
}
async function apiConta(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  const token = getContaToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(API_BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Erro ${res.status}`);
    err.status = res.status;
    err.detalhes = data.detalhes;
    throw err;
  }
  return data;
}

function iniciarCarregando(btn, textoCarregando, hintId) {
  const textoOriginal = btn.textContent;
  btn.disabled = true;
  btn.textContent = textoCarregando;
  const hintEl = hintId ? document.getElementById(hintId) : null;
  const timer = hintEl ? setTimeout(() => { hintEl.style.display = 'block'; }, 4000) : null;
  return function pararCarregando() {
    btn.disabled = false;
    btn.textContent = textoOriginal;
    if (timer) clearTimeout(timer);
    if (hintEl) hintEl.style.display = 'none';
  };
}

const ICONE_OLHO = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>';
const ICONE_OLHO_FECHADO = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C5 20 1 12 1 12a20.4 20.4 0 0 1 4.22-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a20.4 20.4 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

function ligarTogglesSenha(escopo = document) {
  escopo.querySelectorAll('[data-toggle-senha]').forEach((btn) => {
    if (btn.dataset.ligado) return;
    const input = document.getElementById(btn.dataset.toggleSenha);
    if (!input) return;
    btn.dataset.ligado = '1';
    btn.innerHTML = ICONE_OLHO;
    btn.setAttribute('aria-label', 'Mostrar senha');
    btn.addEventListener('click', () => {
      const vaiMostrar = input.type === 'password';
      input.type = vaiMostrar ? 'text' : 'password';
      btn.innerHTML = vaiMostrar ? ICONE_OLHO_FECHADO : ICONE_OLHO;
      btn.setAttribute('aria-label', vaiMostrar ? 'Ocultar senha' : 'Mostrar senha');
    });
  });
}

const AMENITY_GROUPS = [
  {
    categoria: 'Características do imóvel',
    itens: [
      { key: 'area_servico', label: 'Área de serviço', icone: 'lavanderia' },
      { key: 'closet', label: 'Closet', icone: 'armario' },
      { key: 'copa', label: 'Copa', icone: 'cozinha' },
      { key: 'cozinha', label: 'Cozinha', icone: 'cozinha' },
      { key: 'cozinha_americana', label: 'Cozinha americana', icone: 'cozinha' },
      { key: 'dependencia_empregados', label: 'Dependência de empregados', icone: 'casa' },
      { key: 'despensa', label: 'Despensa', icone: 'caixa' },
      { key: 'escritorio', label: 'Escritório', icone: 'maleta' },
      { key: 'lavabo', label: 'Lavabo', icone: 'banheira' },
      { key: 'lavanderia', label: 'Lavanderia', icone: 'lavanderia' },
      { key: 'lareira', label: 'Lareira', icone: 'fogo' },
      { key: 'mezanino', label: 'Mezanino', icone: 'camadas' },
      { key: 'sacada', label: 'Sacada', icone: 'varanda' },
      { key: 'varanda', label: 'Varanda', icone: 'varanda' },
      { key: 'terraco', label: 'Terraço', icone: 'varanda' },
      { key: 'sala_estar', label: 'Sala de estar', icone: 'sofa' },
      { key: 'sala_jantar', label: 'Sala de jantar', icone: 'cozinha' },
      { key: 'sala_tv', label: 'Sala de TV', icone: 'tv' },
      { key: 'suite', label: 'Suíte', icone: 'cama' },
      { key: 'mobiliado', label: 'Mobiliado', icone: 'sofa' },
    ],
  },
  {
    categoria: 'Instalação e segurança',
    itens: [
      { key: 'ar_condicionado', label: 'Ar condicionado', icone: 'flocoNeve' },
      { key: 'aquecimento_central', label: 'Aquecimento central', icone: 'fogo' },
      { key: 'armario_embutido', label: 'Armário embutido', icone: 'armario' },
      { key: 'armario_cozinha', label: 'Armário de cozinha', icone: 'armario' },
      { key: 'portao_eletronico', label: 'Portão eletrônico', icone: 'portao' },
      { key: 'portaria_24h', label: 'Portaria 24h', icone: 'escudo' },
      { key: 'cameras', label: 'Câmeras de segurança', icone: 'camera' },
      { key: 'sistema_alarme', label: 'Sistema de alarme', icone: 'escudo' },
      { key: 'cerca_eletrica', label: 'Cerca elétrica', icone: 'escudo' },
      { key: 'interfone', label: 'Interfone/telefone', icone: 'telefone' },
      { key: 'elevador', label: 'Elevador', icone: 'elevador' },
      { key: 'gerador', label: 'Gerador', icone: 'raio' },
      { key: 'energia_solar', label: 'Aquecedor/energia solar', icone: 'sol' },
      { key: 'internet', label: 'Internet/Wi-Fi', icone: 'wifi' },
      { key: 'acesso_deficientes', label: 'Acesso para deficientes', icone: 'acessibilidade' },
    ],
  },
  {
    categoria: 'Acabamento',
    itens: [
      { key: 'porcelanato', label: 'Porcelanato', icone: 'ladrilho' },
      { key: 'piso_madeira', label: 'Piso de madeira', icone: 'ladrilho' },
      { key: 'piso_frio', label: 'Piso frio', icone: 'ladrilho' },
      { key: 'granito', label: 'Granito', icone: 'ladrilho' },
      { key: 'marmore', label: 'Mármore', icone: 'ladrilho' },
      { key: 'decorado', label: 'Decorado', icone: 'estrela' },
    ],
  },
  {
    categoria: 'Lazer',
    itens: [
      { key: 'piscina', label: 'Piscina', icone: 'piscina' },
      { key: 'churrasqueira', label: 'Churrasqueira', icone: 'churrasqueira' },
      { key: 'espaco_gourmet', label: 'Espaço gourmet', icone: 'churrasqueira' },
      { key: 'academia', label: 'Academia', icone: 'halteres' },
      { key: 'salao_festas', label: 'Salão de festas', icone: 'festa' },
      { key: 'salao_jogos', label: 'Salão de jogos', icone: 'festa' },
      { key: 'playground', label: 'Playground', icone: 'playground' },
      { key: 'quadra_poliesportiva', label: 'Quadra poliesportiva', icone: 'quadra' },
      { key: 'sauna', label: 'Sauna', icone: 'vapor' },
      { key: 'jardim', label: 'Jardim', icone: 'folha' },
      { key: 'espaco_pet', label: 'Espaço pet', icone: 'pata' },
      { key: 'vista_mar', label: 'Vista para o mar', icone: 'sol' },
    ],
  },
];

const AMENITY_INDEX = {};
AMENITY_GROUPS.forEach((g) => g.itens.forEach((it) => { AMENITY_INDEX[it.key] = it; }));

function amenityInfo(key) {
  return AMENITY_INDEX[key] || { key, label: key, icone: null };
}

const ICONES_AMENITY = {
  piscina: '<path d="M2 17c1.3-1 2.7-1 4 0s2.7 1 4 0 2.7-1 4 0 2.7 1 4 0M2 12c1.3-1 2.7-1 4 0s2.7 1 4 0 2.7-1 4 0 2.7 1 4 0M6 8V4M12 8V3M18 8v3"/>',
  churrasqueira: '<path d="M12 2c1.5 2 1.5 3.5 0 5-1.2 1-1.2 2 0 3 2 1.5 2 3-.5 4.5M6 21c0-3.5 2.7-6 6-6s6 2.5 6 6"/>',
  halteres: '<path d="M4 8v8M20 8v8M2 10v4M22 10v4M7 12h10"/>',
  festa: '<path d="M4 21 12 3l8 18-8-4-8 4Z"/>',
  playground: '<circle cx="12" cy="8" r="4"/><path d="M6 21c0-3.3 2.7-6 6-6s6 2.7 6 6"/>',
  quadra: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M12 5v14M3 12h18"/>',
  vapor: '<path d="M6 21c-1-2 1-3 0-5M12 21c-1-2 1-3 0-5M18 21c-1-2 1-3 0-5"/><path d="M6 12c-1-2 1-3 0-5M12 12c-1-2 1-3 0-5M18 12c-1-2 1-3 0-5"/>',
  folha: '<path d="M4 20c8 0 16-8 16-16-8 0-16 8-16 16Z"/><path d="M4 20c2-6 6-10 12-12"/>',
  pata: '<circle cx="7" cy="8" r="1.6"/><circle cx="12" cy="6" r="1.6"/><circle cx="17" cy="8" r="1.6"/><path d="M8 15c-2-1-2-4.5 1-5.4 1.3-.4 2.7-.4 4 0 3 .9 3 4.4 1 5.4-1.3.6-1.7 1.8-1.7 3a2 2 0 0 1-4 0c0-1.2-.4-2.4-1.7-3Z"/>',
  varanda: '<rect x="3" y="10" width="18" height="10" rx="1"/><path d="M3 14h18M7 10V6M12 10V4M17 10V6"/>',
  elevador: '<rect x="6" y="2" width="12" height="20" rx="1"/><path d="m10 9 2-2 2 2M10 15l2 2 2-2"/>',
  escudo: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z"/>',
  camera: '<rect x="2" y="7" width="14" height="11" rx="2"/><path d="M16 10l6-3v10l-6-3Z"/><circle cx="9" cy="12.5" r="2.5"/>',
  telefone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2C10 21 3 14 3 6a2 2 0 0 1 2-2Z"/>',
  portao: '<rect x="3" y="6" width="18" height="14" rx="1"/><path d="M3 6l18 14M21 6 3 20M3 13h18"/>',
  raio: '<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M4.2 4.2l2 2M17.8 17.8l2 2M2 12h3M19 12h3M4.2 19.8l2-2M17.8 6.2l2-2"/>',
  wifi: '<path d="M2 8.5a16 16 0 0 1 20 0M5.5 12.2a11 11 0 0 1 13 0M9 15.8a6 6 0 0 1 6 0"/><circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none"/>',
  acessibilidade: '<circle cx="12" cy="4" r="1.8"/><path d="M12 8v6M8 10h8M12 14l-4 7M12 14l4 7"/>',
  flocoNeve: '<path d="M12 2v20M4.5 6.5l15 11M19.5 6.5l-15 11M6 4l1.5 3M18 4l-1.5 3M6 20l1.5-3M18 20l-1.5-3M2.5 9.5l3 1M2.5 14.5l3-1M21.5 9.5l-3 1M21.5 14.5l-3-1"/>',
  ladrilho: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>',
  estrela: '<path d="m12 2 3 6.5 7 .9-5.2 5 1.3 7-6.1-3.4L5.9 21.4l1.3-7-5.2-5 7-.9L12 2Z"/>',
  armario: '<rect x="4" y="2" width="16" height="20" rx="1"/><path d="M12 2v20M8 12h.01M16 12h.01"/>',
  cozinha: '<path d="M4 3v18M4 3h3v6a3 3 0 0 1-3 3M11 3v18M17 3a4 4 0 0 0-4 4v3h4M15 10v11"/>',
  banheira: '<path d="M3 12h18v2a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5v-2Z"/><path d="M5 12V7a2 2 0 0 1 2-2h1M4 21h16"/>',
  fogo: '<path d="M12 2c1.5 3 4 4.5 4 8a4 4 0 1 1-8 0c0-1 .4-1.8 1-2.5C9.5 9 10 10 10 11c0-3 .5-6 2-9Z"/>',
  camadas: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
  sofa: '<path d="M4 12V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4M3 12h18v5a1 1 0 0 1-1 1h-1v2h-2v-2H6v2H4v-2H3a1 1 0 0 1-1-1v-5Z"/>',
  tv: '<rect x="2" y="4" width="20" height="13" rx="1"/><path d="M9 21h6M12 17v4"/>',
  cama: '<path d="M2 19v-7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v7M2 19v2M22 19v2M2 14h20"/><path d="M5 10V8a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v2"/>',
  caixa: '<path d="M21 8 12 3 3 8l9 5 9-5Z"/><path d="M3 8v9l9 5 9-5V8M12 13v9"/>',
  maleta: '<rect x="2" y="7" width="20" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M2 13h20"/>',
  lavanderia: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="13" r="5"/><circle cx="7" cy="6.5" r=".8" fill="currentColor" stroke="none"/><circle cx="10" cy="6.5" r=".8" fill="currentColor" stroke="none"/>',
  casa: '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/>',
};
const ICONE_GENERICO = '<path d="M9 12.5 11.2 15 16 9"/><circle cx="12" cy="12" r="10"/>';

function amenityIconSvg(icone) {
  const miolo = (icone && ICONES_AMENITY[icone]) || ICONE_GENERICO;
  return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${miolo}</svg>`;
}

function amenityBadgesHTML(amenities) {
  return (amenities || []).map((key) => {
    const info = amenityInfo(key);
    return `<span class="amenity">${amenityIconSvg(info.icone)}<span>${info.label}</span></span>`;
  }).join('');
}

function amenityCheckboxesHTML(selecionados = []) {
  const marcado = new Set(selecionados);
  return AMENITY_GROUPS.map((g) => `
    <div class="amenity-grupo">
      <div class="amenity-grupo-titulo">${g.categoria}</div>
      <div class="amenity-grid">
        ${g.itens.map((it) => `
          <label class="amenity-check">
            <input type="checkbox" value="${it.key}" ${marcado.has(it.key) ? 'checked' : ''}>
            ${amenityIconSvg(it.icone)}
            <span>${it.label}</span>
          </label>
        `).join('')}
      </div>
    </div>
  `).join('');
}

const FAVORITOS_KEY = 'malb_favoritos';

function getFavoritos() {
  try { return JSON.parse(localStorage.getItem(FAVORITOS_KEY) || '[]'); } catch { return []; }
}
function isFavorito(id) {
  return getFavoritos().includes(Number(id));
}
function toggleFavorito(id) {
  id = Number(id);
  let favs = getFavoritos();
  const era = favs.includes(id);
  favs = era ? favs.filter(f => f !== id) : [...favs, id];
  try { localStorage.setItem(FAVORITOS_KEY, JSON.stringify(favs)); } catch {}
  return !era;
}

async function api(path, { method = 'GET', body, auth = false } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Erro ${res.status}`);
    err.status = res.status;
    err.detalhes = data.detalhes;
    throw err;
  }
  return data;
}

function thumbHTML(im) {
  const verbo = im.finalidade === 'aluguel' ? 'para alugar' : 'à venda';
  const alt = `${im.tipo} ${verbo} em ${im.bairro}, ${im.cidade} — Malb Imóveis`;
  const capa = im.foto || (im.fotos && im.fotos[0]) || '';
  if (capa) return `<img src="${capa}" alt="${alt.replace(/"/g, '&quot;')}" loading="lazy">`;
  return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--ink-faint);font-size:.8rem;">sem foto</div>`;
}

function favBtnHTML(id) {
  const ativo = isFavorito(id);
  return `<button type="button" class="fav-btn ${ativo ? 'active' : ''}" data-fav="${id}" aria-label="${ativo ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}" title="${ativo ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}">
    <svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 21s-7.2-4.6-10-9.1C.3 8.6 1.6 5 5.1 4.1c2-.5 4 .3 5.2 2 .3.4.8.4 1.1 0 1.2-1.7 3.2-2.5 5.2-2 3.5.9 4.8 4.5 3.1 7.8C19.2 16.4 12 21 12 21z"/></svg>
  </button>`;
}

function ligarBotoesFavorito(root = document) {
  root.querySelectorAll('[data-fav]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const novoEstado = toggleFavorito(btn.dataset.fav);
      btn.classList.toggle('active', novoEstado);
      btn.setAttribute('aria-label', novoEstado ? 'Remover dos favoritos' : 'Adicionar aos favoritos');
      btn.setAttribute('title', novoEstado ? 'Remover dos favoritos' : 'Adicionar aos favoritos');
      showToast(novoEstado ? 'Adicionado aos favoritos.' : 'Removido dos favoritos.');
    });
  });
}

function cardHTML(im) {
  const per = im.finalidade === 'aluguel' ? '<span class="per">/mês</span>' : '';
  return `<a class="card" href="imovel.html?id=${im.id}">
    <div class="thumb">
      ${thumbHTML(im)}
      <span class="badge ${im.finalidade}">${im.finalidade === 'venda' ? 'Venda' : 'Aluguel'}</span>
      ${favBtnHTML(im.id)}
    </div>
    <div class="body">
      <div class="price">${fmtPreco(im.preco, im.finalidade)}${per}</div>
      <div class="titulo">${im.titulo}</div>
      <div class="local">${im.bairro}, ${im.cidade}</div>
      <div class="specs">
        <span>${im.quartos} qto${im.quartos === 1 ? '' : 's'}</span>
        <span>${im.banheiros} banh.</span>
        <span>${im.vagas} vaga${im.vagas === 1 ? '' : 's'}</span>
        <span>${im.area}m²</span>
      </div>
    </div>
  </a>`;
}

function redimensionarImagem(file, maxLado = 1600, qualidade = 0.82) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onerror = () => reject(new Error('Não foi possível ler o arquivo'));
    leitor.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Arquivo não é uma imagem válida'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxLado || height > maxLado) {
          if (width >= height) { height = Math.round(height * (maxLado / width)); width = maxLado; }
          else { width = Math.round(width * (maxLado / height)); height = maxLado; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', qualidade));
      };
      img.src = leitor.result;
    };
    leitor.readAsDataURL(file);
  });
}

function galeriaHTML(fotos) {
  if (!fotos || !fotos.length) return '';
  return `<div class="galeria-tira">
    ${fotos.map((url, i) => `<button type="button" class="galeria-thumb" data-galeria-idx="${i}"><img src="${url}" alt="Foto ${i + 1} do imóvel" loading="lazy"></button>`).join('')}
  </div>`;
}

function ligarGaleria(container, fotos) {
  if (!fotos || !fotos.length) return;
  container.querySelectorAll('[data-galeria-idx]').forEach((btn) => {
    btn.addEventListener('click', () => abrirLightbox(fotos, Number(btn.dataset.galeriaIdx)));
  });
}

function abrirLightbox(fotos, indiceInicial = 0) {
  let overlay = document.getElementById('lightbox-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'lightbox-overlay';
    overlay.className = 'lightbox-overlay';
    overlay.innerHTML = `
      <button type="button" class="lightbox-fechar" aria-label="Fechar">&times;</button>
      <button type="button" class="lightbox-nav lightbox-prev" aria-label="Foto anterior">&#10094;</button>
      <img class="lightbox-img" src="" alt="Foto do imóvel em tamanho maior">
      <button type="button" class="lightbox-nav lightbox-next" aria-label="Próxima foto">&#10095;</button>
      <div class="lightbox-contador"></div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) fecharLightbox(); });
    overlay.querySelector('.lightbox-fechar').addEventListener('click', fecharLightbox);
    overlay.querySelector('.lightbox-prev').addEventListener('click', () => navegarLightbox(-1));
    overlay.querySelector('.lightbox-next').addEventListener('click', () => navegarLightbox(1));
    document.addEventListener('keydown', (e) => {
      if (!overlay.classList.contains('show')) return;
      if (e.key === 'Escape') fecharLightbox();
      if (e.key === 'ArrowLeft') navegarLightbox(-1);
      if (e.key === 'ArrowRight') navegarLightbox(1);
    });
  }
  overlay._fotos = fotos;
  overlay._indice = indiceInicial;
  atualizarLightbox();
  overlay.classList.add('show');
}
function atualizarLightbox() {
  const overlay = document.getElementById('lightbox-overlay');
  if (!overlay) return;
  const { _fotos: fotos, _indice: i } = overlay;
  overlay.querySelector('.lightbox-img').src = fotos[i];
  overlay.querySelector('.lightbox-contador').textContent = `${i + 1} / ${fotos.length}`;
  overlay.querySelector('.lightbox-prev').style.display = fotos.length > 1 ? '' : 'none';
  overlay.querySelector('.lightbox-next').style.display = fotos.length > 1 ? '' : 'none';
}
function navegarLightbox(delta) {
  const overlay = document.getElementById('lightbox-overlay');
  if (!overlay) return;
  const n = overlay._fotos.length;
  overlay._indice = (overlay._indice + delta + n) % n;
  atualizarLightbox();
}
function fecharLightbox() {
  const overlay = document.getElementById('lightbox-overlay');
  if (overlay) overlay.classList.remove('show');
}

function showToast(msg, ms = 2600) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), ms);
}

function topbarHTML(active, base = '') {
  const link = (href, label, key) => `<a href="${base}${href}" class="btn btn-ghost" style="border:none;padding:.3rem 0;${active===key?'font-weight:700;border-bottom:2px solid var(--accent);border-radius:0;':''}">${label}</a>`;
  return `
  <header class="topbar">
    <div class="topbar-inner">
      <a href="${base}index.html" class="logo"><span class="mark">M</span> Malb Imóveis</a>
      ${link('index.html', 'Início', 'home')}
      ${link('busca.html?finalidade=venda', 'Comprar', 'comprar')}
      ${link('busca.html?finalidade=aluguel', 'Alugar', 'alugar')}
      ${link('favoritos.html', 'Favoritos', 'favoritos')}
      <div class="topbar-spacer"></div>
      ${getContaToken()
        ? `<a href="${base}painel-anunciante.html" class="btn btn-ghost">Meu painel</a>`
        : `<a href="${base}planos.html" class="btn btn-ghost">Anunciar imóveis</a>`}
      <a href="${base}admin/index.html" class="btn btn-ghost">Painel do corretor</a>
    </div>
  </header>`;
}

function footerHTML() {
  return `
  <footer>
    <div class="footer-inner">
      Portal Malb Imóveis — protótipo em desenvolvimento (Fase 2). Dados fictícios para fins de demonstração.
    </div>
  </footer>`;
}
