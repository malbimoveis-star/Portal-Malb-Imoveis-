/* Portal Malb Imóveis — helpers compartilhados do site real (Fase 2).
   Fala com a API em ../../backend (mesma origem — o backend serve estes
   arquivos estáticos, então os caminhos abaixo são relativos, sem CORS). */

const API_BASE = '/api';

function fmtPreco(valor, finalidade) {
  const s = 'R$ ' + Number(valor).toLocaleString('pt-BR');
  return finalidade === 'aluguel' ? s : s;
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
  if (im.foto) return `<img src="${im.foto}" alt="Foto ilustrativa do imóvel" loading="lazy">`;
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

function showToast(msg) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2600);
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
