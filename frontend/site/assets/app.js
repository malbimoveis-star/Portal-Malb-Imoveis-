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

function cardHTML(im) {
  const per = im.finalidade === 'aluguel' ? '<span class="per">/mês</span>' : '';
  return `<a class="card" href="imovel.html?id=${im.id}">
    <div class="thumb">
      ${thumbHTML(im)}
      <span class="badge ${im.finalidade}">${im.finalidade === 'venda' ? 'Venda' : 'Aluguel'}</span>
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

function topbarHTML(active) {
  const link = (href, label, key) => `<a href="${href}" class="btn btn-ghost" style="border:none;padding:.3rem 0;${active===key?'font-weight:700;border-bottom:2px solid var(--accent);border-radius:0;':''}">${label}</a>`;
  return `
  <header class="topbar">
    <div class="topbar-inner">
      <a href="index.html" class="logo"><span class="mark">M</span> Malb Imóveis</a>
      ${link('index.html', 'Início', 'home')}
      ${link('busca.html?finalidade=venda', 'Comprar', 'comprar')}
      ${link('busca.html?finalidade=aluguel', 'Alugar', 'alugar')}
      <div class="topbar-spacer"></div>
      <a href="admin/index.html" class="btn btn-ghost">Painel do corretor</a>
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
