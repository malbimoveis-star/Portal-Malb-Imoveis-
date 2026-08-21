'use strict';

/**
 * Servidor único do Portal Malb Imóveis — Fase 2 (MVP funcional).
 *
 * Sobe a API (/api/*) e serve os arquivos estáticos do site público em
 * ../frontend/site, tudo num único processo Node.js sem dependências de npm
 * (só módulos nativos: http, sqlite, crypto, fs). Isso permite rodar o
 * projeto com um único comando, em qualquer máquina com Node 22+:
 *
 *   node src/server.js
 *
 * Nota sobre a stack: o roadmap do projeto propõe NestJS + Prisma + PostgreSQL
 * para a versão de produção. Este servidor implementa o mesmo modelo de dados
 * e os mesmos contratos de API (ver docs/API.md), mas com módulos nativos do
 * Node, porque o ambiente onde ele foi escrito não tem acesso ao registro do
 * npm para instalar pacotes. Migrar para NestJS/Prisma depois é uma troca de
 * camada, não uma reescrita — as rotas e o schema já estão desenhados para isso.
 *
 * Fase 6 (hardening de produção): variáveis de ambiente (ver `.env.example`),
 * cabeçalhos de segurança, rate limiting nos endpoints públicos mais sensíveis
 * e desligamento gracioso — ver `src/config.js` e `src/security.js`.
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const { config } = require('./config');
const { applySecurityHeaders, getClientIp, checkRateLimit, iniciarLimpezaPeriodica } = require('./security');
const { Router } = require('./router');
const { requireAuth } = require('./auth');
const { registerImoveisRoutes, rowToImovel } = require('./routes/imoveis');
const { registerLeadsRoutes } = require('./routes/leads');
const { registerAuthRoutes } = require('./routes/auth');
const { registerParceirosRoutes } = require('./routes/parceiros');
const { registerUsuariosRoutes } = require('./routes/usuarios');
const { db } = require('./db');
const { buildImovelSeo, buildBuscaSeo, injectBasicSeo, setJsonLd } = require('./seo');

const PORT = config.port;
const STATIC_ROOT = path.join(__dirname, '..', '..', 'frontend', 'site');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
};

const router = new Router();
registerImoveisRoutes(router);
registerLeadsRoutes(router);
registerAuthRoutes(router);
registerParceirosRoutes(router);
registerUsuariosRoutes(router);

function sendJson(res, status, payload) {
  if (payload === null) {
    res.writeHead(status, { 'Content-Length': 0 });
    return res.end();
  }
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendXml(res, status, xml) {
  res.writeHead(status, {
    'Content-Type': 'application/xml; charset=utf-8',
    'Content-Length': Buffer.byteLength(xml),
  });
  res.end(xml);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 5 * 1024 * 1024) { // 5MB — evita payloads absurdos (ex: foto de imóvel)
        reject(new Error('Payload muito grande'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

// Fase 6.1: usado tanto no sitemap quanto no SEO server-side (canonical,
// Open Graph). Só confia em "https" quando o cabeçalho vem de um proxy
// reverso — mesmo critério já usado em security.js para o HSTS.
function getBaseUrl(req) {
  const protocolo = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  return `${protocolo}://${req.headers.host}`;
}

// Fase 6.1: serve imovel.html/busca.html com título, description, canonical,
// Open Graph, Twitter Card e JSON-LD já corretos no HTML (não só via JS) —
// ver o comentário no topo de src/seo.js sobre por quê isso importa para
// robôs que não executam JavaScript (prévias de link no WhatsApp etc).
async function servePaginaComSeo(req, res, pathname, query) {
  const fullPath = path.join(STATIC_ROOT, pathname);
  let html;
  try {
    html = await fs.promises.readFile(fullPath, 'utf8');
  } catch (err) {
    return serveStatic(req, res, pathname);
  }

  const base = getBaseUrl(req);

  if (pathname === '/imovel.html') {
    const idNum = Number(query.id);
    let im = null;
    if (Number.isInteger(idNum)) {
      const row = db.prepare('SELECT * FROM imoveis WHERE id = ?').get(idNum);
      if (row) im = rowToImovel(row);
    }
    if (im) {
      const seo = buildImovelSeo(im, base);
      html = injectBasicSeo(html, seo);
      html = setJsonLd(html, 'ld-json', seo.jsonLd);
    } else {
      // Sem imóvel válido: pelo menos um canonical/og:url reais (nunca deixar
      // vazio) apontando para a própria URL requisitada, com o título/
      // description padrão que já estão no arquivo.
      const url = `${base}${pathname}${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`;
      html = html.replace(/(id="seo-canonical"[^>]*href=")[^"]*(")/, `$1${url}$2`).replace(/(id="og-url"[^>]*content=")[^"]*(")/, `$1${url}$2`);
    }
  } else if (pathname === '/busca.html') {
    const seo = buildBuscaSeo(query, base);
    html = injectBasicSeo(html, seo);
    html = setJsonLd(html, 'ld-json', seo.jsonLd);
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(html) });
  res.end(html);
}

async function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, '');
  let fullPath = path.join(STATIC_ROOT, filePath);

  if (!fullPath.startsWith(STATIC_ROOT)) {
    res.writeHead(403); return res.end('Forbidden');
  }

  try {
    let stat = await fs.promises.stat(fullPath);
    if (stat.isDirectory()) {
      fullPath = path.join(fullPath, 'index.html');
      stat = await fs.promises.stat(fullPath);
    }
    const ext = path.extname(fullPath);
    const data = await fs.promises.readFile(fullPath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': data.length });
    res.end(data);
  } catch (err) {
    // fallback simples de SPA: se não achou arquivo estático, tenta servir index.html
    // (útil para rotas como /imovel.html?id=3 que já existem como arquivo real,
    // e evita 404 cru para o usuário em caminhos desconhecidos)
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Não encontrado');
  }
}

const server = http.createServer(async (req, res) => {
  const inicio = Date.now();
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const query = Object.fromEntries(url.searchParams.entries());

  res.on('finish', () => {
    const ms = Date.now() - inicio;
    console.log(`${req.method} ${pathname} ${res.statusCode} ${ms}ms`);
  });

  applySecurityHeaders(req, res);

  // CORS: em desenvolvimento (config.allowedOrigin padrão "*") permanece
  // permissivo, como nas Fases 2-5. Em produção, defina ALLOWED_ORIGIN no
  // .env com o domínio real do site para restringir quem pode chamar a API
  // a partir do navegador.
  res.setHeader('Access-Control-Allow-Origin', config.allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Api-Key');
  if (config.allowedOrigin !== '*') res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  if (pathname === '/api/health') {
    return sendJson(res, 200, { status: 'ok', timestamp: new Date().toISOString() });
  }

  // Rate limiting — só nos dois endpoints públicos (sem autenticação) mais
  // expostos a abuso automatizado: tentativas de login e envio em massa de
  // leads falsos. As demais rotas exigem sessão ou chave de API de parceiro,
  // o que já limita bastante o abuso anônimo.
  if (req.method === 'POST' && pathname === '/api/auth/login') {
    const ip = getClientIp(req);
    const { permitido, retryAfterSegundos } = checkRateLimit('login', ip, config.rateLimit.login);
    if (!permitido) {
      res.setHeader('Retry-After', String(retryAfterSegundos));
      return sendJson(res, 429, { error: 'Muitas tentativas de login. Tente novamente em alguns minutos.' });
    }
  }
  if (req.method === 'POST' && pathname === '/api/leads') {
    const ip = getClientIp(req);
    const { permitido, retryAfterSegundos } = checkRateLimit('lead', ip, config.rateLimit.leadPublico);
    if (!permitido) {
      res.setHeader('Retry-After', String(retryAfterSegundos));
      return sendJson(res, 429, { error: 'Muitos envios em pouco tempo. Tente novamente mais tarde.' });
    }
  }

  if (pathname === '/sitemap.xml') {
    // favoritos.html fica de fora: é uma lista pessoal (localStorage de
    // quem visita), sem conteúdo único por URL — não tem valor para indexar
    // e já leva "noindex" (ver frontend/site/favoritos.html).
    const base = getBaseUrl(req);
    const rows = db.prepare("SELECT id, updated_at FROM imoveis WHERE status = 'disponivel'").all();
    const urls = [
      `<url><loc>${base}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
      `<url><loc>${base}/busca.html</loc><changefreq>daily</changefreq><priority>0.9</priority></url>`,
      ...rows.map((r) => `<url><loc>${base}/imovel.html?id=${r.id}</loc><lastmod>${(r.updated_at || '').slice(0, 10)}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`),
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;
    res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' });
    return res.end(xml);
  }

  if (pathname.startsWith('/api/')) {
    const match = router.match(req.method, pathname);
    if (!match) return sendJson(res, 404, { error: 'Rota não encontrada' });

    let body = {};
    if (req.method === 'POST' || req.method === 'PUT') {
      try {
        body = await readBody(req);
      } catch (err) {
        return sendJson(res, 400, { error: 'JSON inválido no corpo da requisição' });
      }
    }

    const user = requireAuth(req);
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    const wrappedRes = {
      json: (status, payload) => sendJson(res, status, payload),
      xml: (status, xml) => sendXml(res, status, xml),
    };
    try {
      match.handler(req, wrappedRes, match.params, query, body, user, token);
    } catch (err) {
      console.error('[erro na rota]', err);
      sendJson(res, 500, { error: 'Erro interno do servidor' });
    }
    return;
  }

  if (pathname === '/imovel.html' || pathname === '/busca.html') {
    return servePaginaComSeo(req, res, pathname, query);
  }

  return serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`Portal Malb Imóveis — API + site rodando em http://localhost:${PORT}`);
  console.log(`Endpoints da API em http://localhost:${PORT}/api/ (ver docs/API.md)`);
  console.log(`Ambiente: ${config.nodeEnv}${config.trustProxy ? ' (atrás de proxy reverso)' : ''}`);
});

iniciarLimpezaPeriodica();

// Desligamento gracioso: para de aceitar conexões novas, deixa as em
// andamento terminarem, e só então fecha o banco — evita cortar uma escrita
// no meio (ex: um lead sendo salvo) quando o processo é reiniciado/parado
// em produção (Docker, systemd, deploy de uma nova versão etc).
function desligar(sinal) {
  console.log(`\nRecebido ${sinal}, encerrando graciosamente...`);
  server.close(() => {
    try {
      db.close();
    } catch (err) {
      // já fechado ou nunca chegou a abrir — sem problema no encerramento
    }
    console.log('Servidor encerrado.');
    process.exit(0);
  });
  // Se alguma conexão não fechar sozinha, força a saída depois de 10s em vez
  // de deixar o processo pendurado indefinidamente.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => desligar('SIGTERM'));
process.on('SIGINT', () => desligar('SIGINT'));

module.exports = { server };
