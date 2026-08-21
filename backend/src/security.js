'use strict';

/**
 * Segurança de produção — Fase 6.
 *
 * Cabeçalhos de segurança e rate limiting escritos à mão (sem `helmet` nem
 * `express-rate-limit`) para manter a regra do projeto de zero dependências
 * de npm. Não é tão completo quanto essas bibliotecas, mas cobre o que
 * importa para este site: cliques indevidos em iframe, MIME sniffing,
 * vazamento de referrer entre sites, e força bruta/spam nos endpoints
 * públicos mais sensíveis (login e formulário de lead).
 */

const { config } = require('./config');

function applySecurityHeaders(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  // HSTS só faz sentido quando a conexão já chegou via HTTPS (ex: atrás do
  // Caddy do infra/docker-compose.yml, que faz o TLS). Em HTTP puro (dev
  // local) esse cabeçalho não tem efeito e pode ser ignorado com segurança,
  // mas só o enviamos quando de fato detectamos HTTPS pra não confundir
  // quem estiver depurando localmente.
  const viaHttps = req.headers['x-forwarded-proto'] === 'https';
  if (config.isProduction && viaHttps) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
}

/**
 * IP de origem da requisição. Só olha X-Forwarded-For quando TRUST_PROXY
 * está ligado (ver config.js) — do contrário usa o socket direto, que não
 * pode ser falsificado pelo cliente.
 */
function getClientIp(req) {
  if (config.trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'desconhecido';
}

// Rate limiter simples de janela fixa, em memória (por processo). Suficiente
// para um único servidor Node como este; se um dia o app rodar em múltiplas
// réplicas atrás de um load balancer, isso precisaria virar um contador
// compartilhado (ex: Redis) — anotado aqui para não surpreender no futuro.
const buckets = new Map(); // chave "categoria:ip" -> { contagem, resetEm }

function checkRateLimit(categoria, ip, { janelaMs, max }) {
  const chave = `${categoria}:${ip}`;
  const agora = Date.now();
  let bucket = buckets.get(chave);

  if (!bucket || agora >= bucket.resetEm) {
    bucket = { contagem: 0, resetEm: agora + janelaMs };
    buckets.set(chave, bucket);
  }

  bucket.contagem += 1;

  const permitido = bucket.contagem <= max;
  const restante = Math.max(0, max - bucket.contagem);
  const retryAfterSegundos = Math.ceil((bucket.resetEm - agora) / 1000);

  return { permitido, restante, retryAfterSegundos };
}

// Evita crescimento ilimitado do Map em processos de longa duração: limpa
// buckets já expirados a cada 10 minutos.
function iniciarLimpezaPeriodica() {
  const intervalo = setInterval(() => {
    const agora = Date.now();
    for (const [chave, bucket] of buckets) {
      if (agora >= bucket.resetEm) buckets.delete(chave);
    }
  }, 10 * 60 * 1000);
  intervalo.unref(); // não impede o processo de encerrar (ex: em testes)
  return intervalo;
}

module.exports = { applySecurityHeaders, getClientIp, checkRateLimit, iniciarLimpezaPeriodica };
