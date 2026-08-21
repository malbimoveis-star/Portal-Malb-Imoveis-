'use strict';

/**
 * Configuração de produção — Fase 6.
 *
 * Tudo aqui vem de variáveis de ambiente, com defaults seguros para
 * desenvolvimento local (rodar `node src/server.js` sem nenhum `.env`
 * continua funcionando exatamente como nas Fases 2-5). Em produção, o
 * jeito recomendado de definir essas variáveis é um arquivo `.env` (ver
 * `.env.example`) carregado com `node --env-file=.env src/server.js`
 * (suportado nativamente pelo Node 20.6+, sem precisar de nenhum pacote
 * do npm).
 */

function bool(valor, padrao) {
  if (valor === undefined || valor === '') return padrao;
  return ['1', 'true', 'sim', 'yes', 'on'].includes(String(valor).toLowerCase());
}

function int(valor, padrao) {
  const n = parseInt(valor, 10);
  return Number.isFinite(n) ? n : padrao;
}

const NODE_ENV = process.env.NODE_ENV || 'development';

const config = {
  nodeEnv: NODE_ENV,
  isProduction: NODE_ENV === 'production',
  port: int(process.env.PORT, 3001),

  // Em produção, restrinja para o domínio real do site (ex: "https://malbimoveis.com.br").
  // "*" (padrão) é adequado para desenvolvimento local, onde o front pode ser
  // aberto de portas/origens diferentes.
  allowedOrigin: process.env.ALLOWED_ORIGIN || '*',

  // Só confie no cabeçalho X-Forwarded-For quando o servidor estiver de fato
  // atrás de um proxy reverso confiável (Caddy/nginx no docker-compose desta
  // Fase 6). Fora desse caso, confiar nesse cabeçalho permite falsificar o IP
  // de origem e furar o rate limiting.
  trustProxy: bool(process.env.TRUST_PROXY, false),

  // Caminho do arquivo SQLite. Default preserva o comportamento das Fases 2-5
  // (backend/data/malb.db); em Docker isso aponta para um volume montado.
  dbPath: process.env.DB_PATH || null,

  rateLimit: {
    // Login: poucas tentativas por IP, para dificultar força bruta de senha.
    login: { janelaMs: int(process.env.RATE_LIMIT_LOGIN_WINDOW_MS, 15 * 60 * 1000), max: int(process.env.RATE_LIMIT_LOGIN_MAX, 10) },
    // Lead público: o formulário de interesse não exige login, então é o
    // endpoint mais exposto a spam/abuso automatizado.
    leadPublico: { janelaMs: int(process.env.RATE_LIMIT_LEAD_WINDOW_MS, 60 * 60 * 1000), max: int(process.env.RATE_LIMIT_LEAD_MAX, 20) },
  },
};

module.exports = { config };
