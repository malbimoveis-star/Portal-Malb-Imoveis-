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
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const { Router } = require('./router');
const { requireAuth } = require('./auth');
const { registerImoveisRoutes } = require('./routes/imoveis');
const { registerLeadsRoutes } = require('./routes/leads');
const { registerAuthRoutes } = require('./routes/auth');

const PORT = process.env.PORT || 3001;
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
};

const router = new Router();
registerImoveisRoutes(router);
registerLeadsRoutes(router);
registerAuthRoutes(router);

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
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const query = Object.fromEntries(url.searchParams.entries());

  // CORS permissivo — útil em desenvolvimento (ex: abrir o front noutra porta/origem)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  if (pathname === '/api/health') {
    return sendJson(res, 200, { status: 'ok', timestamp: new Date().toISOString() });
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

    const wrappedRes = { json: (status, payload) => sendJson(res, status, payload) };
    try {
      match.handler(req, wrappedRes, match.params, query, body, user, token);
    } catch (err) {
      console.error('[erro na rota]', err);
      sendJson(res, 500, { error: 'Erro interno do servidor' });
    }
    return;
  }

  return serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`Portal Malb Imóveis — API + site rodando em http://localhost:${PORT}`);
  console.log(`Endpoints da API em http://localhost:${PORT}/api/ (ver docs/API.md)`);
});
