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

  // Só bairro/tipo/finalidade entram no canonical — os demais filtros
  // (preço, área, quartos, ordenação, busca livre) não geram uma URL
  // "oficial" própria, pra não competir no índice do Google com variações
  // quase idênticas da mesma busca.
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

/* Fase 7 — login separado pros anunciantes (corretor autônomo ou imobiliária
   que se cadastra pra anunciar no portal). Guardado numa chave diferente do
   token do painel interno (malb_admin_token) — são duas contas/dois logins
   completamente separados, uma pessoa pode até estar logada nos dois ao
   mesmo tempo sem conflito. */
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

/* Estado de "carregando" num botão de formulário — usado em todo formulário
   que chama a API (login, cadastro, checkout). No plano gratuito do Render
   o servidor "dorme" depois de um tempo sem uso, então a primeira
   requisição do dia pode demorar bem mais que o normal (até ~1 minuto) pra
   responder; sem um aviso, essa demora parece a página ter travado. Uso:
     const parar = iniciarCarregando(btn, 'Entrando…', 'hint-acordando');
     try { ...chamada à api()... } finally { parar(); }
   `hintId` é opcional: o id de um <p> escondido por padrão que aparece
   depois de alguns segundos se a chamada ainda não voltou. */
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

/* Botão de mostrar/ocultar senha — usado no login e no cadastro de corretor
   (aba Equipe). Basta envolver o <input type="password"> numa <div
   class="campo-senha"> com um <button data-toggle-senha="id-do-input">
   dentro; esta função liga o clique em todos os botões desse tipo achados
   no escopo dado (chamar de novo é seguro, não liga duas vezes o mesmo). */
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

/* Favoritos: guardados só no navegador de quem está visitando (localStorage),
   sem precisar de login. Cada visitante tem sua própria lista. */
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
  return !era; // retorna o novo estado (true = favoritado agora)
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
  // Alt text descritivo (tipo + bairro + finalidade) em vez de um texto
  // genérico — ajuda a indexação no Google Imagens, que é uma fonte real
  // de tráfego para fotos de imóveis, e também a acessibilidade (leitores
  // de tela descrevem o imóvel, não só "foto ilustrativa").
  const verbo = im.finalidade === 'aluguel' ? 'para alugar' : 'à venda';
  const alt = `${im.tipo} ${verbo} em ${im.bairro}, ${im.cidade} — Malb Imóveis`;
  if (im.foto) return `<img src="${im.foto}" alt="${alt.replace(/"/g, '&quot;')}" loading="lazy">`;
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
      <a href="${base}planos.html" class="btn btn-ghost">Anunciar imóveis</a>
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
