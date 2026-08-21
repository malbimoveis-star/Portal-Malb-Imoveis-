'use strict';

/**
 * Autenticação de parceiros (Fase 4 — API de integração com CRMs).
 *
 * Diferente da autenticação do painel (sessão por login/senha em auth.js),
 * parceiros se autenticam com uma chave de API de alta entropia, enviada no
 * header `X-Api-Key`. Como a chave já é aleatória e longa (32 bytes), um hash
 * rápido (SHA-256) é suficiente para guardá-la com segurança — o mesmo
 * padrão usado por GitHub, Stripe etc. para tokens de API (diferente de
 * senhas, que precisam de scrypt/bcrypt por terem baixa entropia).
 */

const crypto = require('node:crypto');
const { db } = require('./db');

function gerarChaveApi() {
  const chave = 'malb_' + crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(chave).digest('hex');
  const prefixo = chave.slice(0, 12);
  return { chave, hash, prefixo };
}

function gerarWebhookSecret() {
  return crypto.randomBytes(24).toString('hex');
}

function requireParceiro(req) {
  const chave = req.headers['x-api-key'];
  if (!chave) return null;
  const hash = crypto.createHash('sha256').update(chave).digest('hex');
  const parceiro = db.prepare('SELECT * FROM parceiros WHERE chave_hash = ?').get(hash);
  if (!parceiro || !parceiro.ativo) return null;
  return parceiro;
}

module.exports = { gerarChaveApi, gerarWebhookSecret, requireParceiro };
