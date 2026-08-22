'use strict';

const crypto = require('node:crypto');
const { db, hashPassword } = require('./db');

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 dias

function verifyPassword(password, salt, expectedHash) {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function login(email, password) {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return null;
  if (!verifyPassword(password, user.senha_salt, user.senha_hash)) return null;
  // Usuário desativado (ex: corretor que saiu da imobiliária) não consegue
  // logar, mesmo com a senha certa — mesmo padrão do "ativo" dos parceiros.
  if (!user.ativo) return null;

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
    token,
    user.id,
    expiresAt
  );
  return {
    token,
    user: { id: user.id, nome: user.nome, email: user.email, creci: user.creci, papel: user.papel },
  };
}

function logout(token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

function getUserFromToken(token) {
  if (!token) return null;
  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  const user = db.prepare('SELECT id, nome, email, creci, papel, ativo FROM users WHERE id = ?').get(session.user_id);
  // Sessão de um usuário que foi desativado depois do login para de valer
  // imediatamente — evita que um corretor desligado continue com acesso
  // só porque o token de 7 dias ainda não expirou.
  if (!user || !user.ativo) return null;
  return user;
}

function requireAuth(req) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const user = getUserFromToken(token);
  return user;
}

// --- Convite de acesso e "esqueci minha senha" ------------------------
//
// Mesmo padrão de segurança usado nas sessões: token aleatório de 32 bytes,
// de uso único (used_at) e com expiração curta. O convite dura mais (a
// pessoa pode demorar pra abrir o e-mail); a redefinição de senha dura
// pouco, por ser mais sensível.

const CONVITE_TTL_MS = 1000 * 60 * 60 * 24 * 3; // 3 dias
const REDEFINICAO_TTL_MS = 1000 * 60 * 60; // 1 hora

function criarToken(userId, tipo, ttlMs) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  db.prepare('INSERT INTO auth_tokens (token, user_id, tipo, expires_at) VALUES (?, ?, ?, ?)').run(
    token,
    userId,
    tipo,
    expiresAt
  );
  return token;
}

function gerarTokenConvite(userId) {
  return criarToken(userId, 'convite', CONVITE_TTL_MS);
}

// Retorna null tanto se o e-mail não existir quanto se o usuário estiver
// desativado — de propósito, pra rota nunca revelar se um e-mail tem
// cadastro ou não (a resposta HTTP é sempre a mesma, veja routes/auth.js).
function gerarTokenRedefinicao(email) {
  const user = db.prepare('SELECT * FROM users WHERE email = ? AND ativo = 1').get(email);
  if (!user) return null;
  return { token: criarToken(user.id, 'redefinicao', REDEFINICAO_TTL_MS), user };
}

function consultarToken(token) {
  if (!token) return null;
  const row = db.prepare('SELECT * FROM auth_tokens WHERE token = ?').get(token);
  if (!row || row.used_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  const user = db.prepare('SELECT id, nome, email FROM users WHERE id = ?').get(row.user_id);
  if (!user) return null;
  return { tipo: row.tipo, user };
}

function definirSenhaComToken(token, novaSenha) {
  const info = consultarToken(token);
  if (!info) return false;
  const { hash, salt } = hashPassword(novaSenha);
  db.prepare('UPDATE users SET senha_hash = ?, senha_salt = ?, ativo = 1 WHERE id = ?').run(
    hash,
    salt,
    info.user.id
  );
  db.prepare("UPDATE auth_tokens SET used_at = datetime('now') WHERE token = ?").run(token);
  // Por segurança, derruba sessões antigas — se alguém mais tinha um token
  // de sessão válido dessa conta, ele para de funcionar depois da troca.
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(info.user.id);
  return true;
}

module.exports = {
  login,
  logout,
  getUserFromToken,
  requireAuth,
  gerarTokenConvite,
  gerarTokenRedefinicao,
  consultarToken,
  definirSenhaComToken,
};
