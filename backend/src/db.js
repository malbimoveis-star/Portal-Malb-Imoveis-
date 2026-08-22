'use strict';

/**
 * Camada de banco de dados do Portal Malb Imóveis.
 *
 * Usa `node:sqlite` (nativo do Node.js, sem dependências de npm) para que a API
 * rode com um único comando (`node src/server.js`), sem precisar de `npm install`
 * nem de um servidor de banco de dados separado.
 *
 * Migração futura: o modelo de dados aqui foi desenhado para mapear 1:1 com o
 * schema Prisma/PostgreSQL descrito em `docs/ARQUITETURA.md`, então trocar o
 * banco por PostgreSQL (via Prisma) mais adiante é uma troca desta camada,
 * sem precisar mexer nas rotas ou no restante da aplicação.
 */

const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { config } = require('./config');

const DATA_DIR = path.join(__dirname, '..', 'data');
// Fase 6: DB_PATH pode ser sobrescrito por variável de ambiente (ex: em Docker,
// apontando para o volume persistente montado em /data). Sem essa variável,
// o comportamento é idêntico ao das Fases 2-5: backend/data/malb.db.
const DB_PATH = config.dbPath || path.join(DATA_DIR, 'malb.db');
const SEED_PATH = path.join(DATA_DIR, 'seed-imoveis.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS imoveis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL,
    finalidade TEXT NOT NULL CHECK (finalidade IN ('venda','aluguel')),
    preco REAL NOT NULL,
    titulo TEXT NOT NULL,
    bairro TEXT NOT NULL,
    cidade TEXT NOT NULL,
    quartos INTEGER NOT NULL DEFAULT 0,
    banheiros INTEGER NOT NULL DEFAULT 0,
    vagas INTEGER NOT NULL DEFAULT 0,
    area REAL NOT NULL DEFAULT 0,
    descricao TEXT NOT NULL DEFAULT '',
    amenities TEXT NOT NULL DEFAULT '[]',
    foto TEXT NOT NULL DEFAULT '',
    lat REAL,
    lng REAL,
    status TEXT NOT NULL DEFAULT 'disponivel' CHECK (status IN ('disponivel','reservado','vendido','alugado')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    imovel_id INTEGER REFERENCES imoveis(id) ON DELETE SET NULL,
    nome TEXT NOT NULL,
    contato TEXT NOT NULL,
    mensagem TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'novo' CHECK (status IN ('novo','em_atendimento','convertido','perdido')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    creci TEXT,
    senha_hash TEXT NOT NULL,
    senha_salt TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS parceiros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    chave_hash TEXT NOT NULL UNIQUE,
    chave_prefixo TEXT NOT NULL,
    webhook_url TEXT,
    webhook_secret TEXT NOT NULL,
    ativo INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS webhook_entregas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parceiro_id INTEGER NOT NULL REFERENCES parceiros(id) ON DELETE CASCADE,
    evento TEXT NOT NULL,
    sucesso INTEGER NOT NULL,
    status_http INTEGER,
    erro TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS lead_interacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    tipo TEXT NOT NULL DEFAULT 'nota',
    texto TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Tokens de uso único para "convite de acesso" (novo usuário definir a
  -- própria senha) e "esqueci minha senha". Curta duração, nunca reutilizados
  -- (used_at marca quando foram consumidos) — ver backend/src/auth.js.
  CREATE TABLE IF NOT EXISTS auth_tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL CHECK (tipo IN ('convite','redefinicao')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    used_at TEXT
  );
`);

// Migração leve: adiciona colunas novas em bancos já existentes (criados antes
// de lat/lng existirem no schema). node:sqlite não tem "IF NOT EXISTS" para
// ALTER TABLE ADD COLUMN, então checamos pragma_table_info antes.
function garantirColuna(tabela, coluna, definicao) {
  const cols = db.prepare(`SELECT name FROM pragma_table_info(?)`).all(tabela);
  if (!cols.some((c) => c.name === coluna)) {
    db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao}`);
    return true;
  }
  return false;
}
garantirColuna('imoveis', 'lat', 'REAL');
garantirColuna('imoveis', 'lng', 'REAL');
garantirColuna('imoveis', 'origem', "TEXT NOT NULL DEFAULT 'proprio'");
garantirColuna('imoveis', 'parceiro_id', 'INTEGER REFERENCES parceiros(id) ON DELETE SET NULL');
garantirColuna('imoveis', 'referencia_externa', 'TEXT');

// Fase 5 — CRM interno: papel/ativo em users (para distinguir admin de
// corretor e permitir desativar acesso sem apagar histórico), e atribuição
// de leads a um corretor. Bancos já existentes (Fases 2-4) tinham só um
// usuário — a migração abaixo promove esse usuário a admin automaticamente
// (só roda quando a coluna 'papel' está sendo criada agora, uma vez só).
const papelColunaNova = garantirColuna('users', 'papel', "TEXT NOT NULL DEFAULT 'corretor'");
garantirColuna('users', 'ativo', 'INTEGER NOT NULL DEFAULT 1');
if (papelColunaNova) {
  db.exec("UPDATE users SET papel = 'admin' WHERE id = (SELECT MIN(id) FROM users)");
}
garantirColuna('leads', 'corretor_id', 'INTEGER REFERENCES users(id) ON DELETE SET NULL');

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

function seedIfEmpty() {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM imoveis').get();
  if (count === 0 && fs.existsSync(SEED_PATH)) {
    const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
    const insert = db.prepare(`
      INSERT INTO imoveis (tipo, finalidade, preco, titulo, bairro, cidade, quartos, banheiros, vagas, area, descricao, amenities, foto, lat, lng)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertMany = db.transaction ? null : null; // node:sqlite não tem helper de transação de alto nível ainda
    db.exec('BEGIN');
    try {
      for (const im of seed) {
        insert.run(
          im.tipo,
          im.finalidade,
          im.preco,
          im.titulo,
          im.bairro,
          im.cidade,
          im.quartos,
          im.banheiros,
          im.vagas,
          im.area,
          im.desc || '',
          JSON.stringify(im.amenities || []),
          im.foto || '',
          im.lat != null ? Number(im.lat) : null,
          im.lng != null ? Number(im.lng) : null
        );
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    console.log(`[seed] ${seed.length} imóveis inseridos.`);
  }

  const { count: userCount } = db.prepare('SELECT COUNT(*) AS count FROM users').get();
  if (userCount === 0) {
    const { hash, salt } = hashPassword('malb2026');
    db.prepare(`
      INSERT INTO users (nome, email, creci, senha_hash, senha_salt, papel)
      VALUES (?, ?, ?, ?, ?, 'admin')
    `).run('Corretor Malb (demo)', 'admin@malbimoveis.com', '000000-F (exemplo)', hash, salt);
    console.log('[seed] Usuário demo criado: admin@malbimoveis.com / malb2026 (troque antes de ir a produção).');
  }
}

seedIfEmpty();

module.exports = { db, hashPassword, DB_PATH };
