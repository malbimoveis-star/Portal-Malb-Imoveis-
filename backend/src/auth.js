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

module.exports = { login, logout, getUserFromToken, requireAuth };
