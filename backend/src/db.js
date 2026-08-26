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

  -- Fase 7 — Planos e cadastro de anunciantes (corretores autônomos e
  -- imobiliárias que querem anunciar imóveis no portal, modelo VivaReal).
  -- Isso é diferente da tabela users: users é a equipe interna da Malb
  -- Imóveis (quem usa o painel /admin pra gerenciar os imóveis da própria
  -- Malb); contas são clientes externos do portal, cada um com seu próprio
  -- plano pago e seus próprios imóveis anunciados.
  CREATE TABLE IF NOT EXISTS planos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL CHECK (tipo IN ('corretor','imobiliaria')),
    nome TEXT NOT NULL,
    preco_mensal REAL NOT NULL,
    limite_anuncios INTEGER,
    destaque INTEGER NOT NULL DEFAULT 0,
    descricao TEXT NOT NULL DEFAULT '',
    recursos TEXT NOT NULL DEFAULT '[]',
    ordem INTEGER NOT NULL DEFAULT 0,
    ativo INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS contas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL CHECK (tipo IN ('corretor','imobiliaria')),
    nome TEXT NOT NULL,
    nome_fantasia TEXT,
    cnpj TEXT,
    cpf TEXT,
    creci TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    telefone TEXT,
    senha_hash TEXT NOT NULL,
    senha_salt TEXT NOT NULL,
    plano_id INTEGER REFERENCES planos(id) ON DELETE SET NULL,
    status_assinatura TEXT NOT NULL DEFAULT 'pendente' CHECK (status_assinatura IN ('pendente','ativa','cancelada','inadimplente')),
    ativo INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS assinaturas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conta_id INTEGER NOT NULL REFERENCES contas(id) ON DELETE CASCADE,
    plano_id INTEGER NOT NULL REFERENCES planos(id),
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','ativa','cancelada')),
    metodo_pagamento TEXT,
    simulado INTEGER NOT NULL DEFAULT 1,
    inicio TEXT NOT NULL DEFAULT (datetime('now')),
    fim TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS contas_sessions (
    token TEXT PRIMARY KEY,
    conta_id INTEGER NOT NULL REFERENCES contas(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
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
// Fase 7.1 — vínculo entre um imóvel e a conta de anunciante (corretor ou
// imobiliária) dona dele, pro anunciante ver só os próprios imóveis no
// painel dele e o admin ver de quem é cada um. NULL continua significando
// "imóvel próprio da Malb" — nada muda pros imóveis que já existem hoje.
garantirColuna('imoveis', 'conta_id', 'INTEGER REFERENCES contas(id) ON DELETE SET NULL');

// Fase 7.2 — cadastro completo de imóvel (autoatendimento do anunciante +
// campos compatíveis com o que CRMs imobiliários parceiros (ex: Code49/
// Infinity, e o padrão de mercado VRSync usado por ZAP/VivaReal) costumam
// enviar). `area` continua sendo a área total, como já era; `area_util` é
// nova. `vagas` continua sendo o total de vagas (mantido em sincronia com
// vagas_cobertas + vagas_descobertas pelas rotas), preservando quem já
// consumia esse campo (site público, cards, XML de parceiro).
garantirColuna('imoveis', 'suites', 'INTEGER NOT NULL DEFAULT 0');
garantirColuna('imoveis', 'lavabos', 'INTEGER NOT NULL DEFAULT 0');
garantirColuna('imoveis', 'vagas_cobertas', 'INTEGER NOT NULL DEFAULT 0');
garantirColuna('imoveis', 'vagas_descobertas', 'INTEGER NOT NULL DEFAULT 0');
garantirColuna('imoveis', 'area_util', 'REAL NOT NULL DEFAULT 0');
garantirColuna('imoveis', 'endereco', "TEXT NOT NULL DEFAULT ''");
garantirColuna('imoveis', 'numero', "TEXT NOT NULL DEFAULT ''");
garantirColuna('imoveis', 'complemento', "TEXT NOT NULL DEFAULT ''");
garantirColuna('imoveis', 'cep', "TEXT NOT NULL DEFAULT ''");
garantirColuna('imoveis', 'condominio', 'REAL NOT NULL DEFAULT 0');
garantirColuna('imoveis', 'iptu', 'REAL NOT NULL DEFAULT 0');
garantirColuna('imoveis', 'ano_construcao', 'INTEGER');
// Múltiplas fotos (JSON array de URLs/data-URIs) — `foto` (coluna antiga,
// uma só imagem) é mantida em sincronia com fotos[0] pelas rotas, pra não
// quebrar nada que ainda lê só esse campo (cards do site, feed de parceiro).
const fotosColunaNova = garantirColuna('imoveis', 'fotos', "TEXT NOT NULL DEFAULT '[]'");
if (fotosColunaNova) {
  // Backfill único: imóveis já cadastrados antes dessa coluna existir tinham
  // só `foto` — copia pra dentro do array novo, pra não "sumir" a foto deles
  // assim que a galeria de múltiplas fotos entrar no ar.
  const semFotos = db.prepare("SELECT id, foto FROM imoveis WHERE foto != '' AND fotos = '[]'").all();
  const upd = db.prepare('UPDATE imoveis SET fotos = ? WHERE id = ?');
  for (const row of semFotos) upd.run(JSON.stringify([row.foto]), row.id);
}

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

  const { count: planoCount } = db.prepare('SELECT COUNT(*) AS count FROM planos').get();
  if (planoCount === 0) {
    const insertPlano = db.prepare(`
      INSERT INTO planos (tipo, nome, preco_mensal, limite_anuncios, destaque, descricao, recursos, ordem)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    // Sugestão inicial de preços — ajuste livremente pela aba de planos no
    // painel admin (ou direto no banco) quando quiser mudar os valores.
    const planosIniciais = [
      ['corretor', 'Básico', 0, 5, 0, 'Pra começar a anunciar sem custo.', ['Até 5 imóveis anunciados', 'Página pública do corretor', 'Recebimento de leads por e-mail'], 1],
      ['corretor', 'Profissional', 49.9, 30, 0, 'Pra quem já vive de imóveis.', ['Até 30 imóveis anunciados', 'Selo de corretor verificado', 'Estatísticas de visualização'], 2],
      ['corretor', 'Premium', 99.9, null, 1, 'Máximo alcance pros seus imóveis.', ['Imóveis ilimitados', 'Destaque nas buscas', 'Relatório mensal de desempenho'], 3],
      ['imobiliaria', 'Starter', 149.9, 50, 0, 'Pra imobiliárias pequenas.', ['Até 50 imóveis anunciados', 'Até 3 corretores vinculados', 'Painel de leads compartilhado'], 1],
      ['imobiliaria', 'Business', 299.9, 200, 1, 'Pra imobiliárias em crescimento.', ['Até 200 imóveis anunciados', 'Até 15 corretores vinculados', 'Destaque nas buscas', 'Relatórios avançados'], 2],
      ['imobiliaria', 'Enterprise', 0, null, 1, 'Sob consulta, pra grandes redes.', ['Imóveis e corretores ilimitados', 'Integração via API', 'Gerente de contas dedicado'], 3],
    ];
    for (const p of planosIniciais) {
      insertPlano.run(p[0], p[1], p[2], p[3], p[4], p[5], JSON.stringify(p[6]), p[7]);
    }
    console.log(`[seed] ${planosIniciais.length} planos inseridos.`);
  }

  const { count: userCount } = db.prepare('SELECT COUNT(*) AS count FROM users').get();
  if (userCount === 0) {
    const { hash, salt } = hashPassword('MalbAdmin2026!');
    db.prepare(`
      INSERT INTO users (nome, email, creci, senha_hash, senha_salt, papel)
      VALUES (?, ?, ?, ?, ?, 'admin')
    `).run('Malb Imóveis (admin)', 'malbimoveis@gmail.com', '000000-F (exemplo)', hash, salt);
    console.log('[seed] Usuário admin criado: malbimoveis@gmail.com (troque a senha inicial pelo painel, aba Equipe).');
  }
}

seedIfEmpty();

module.exports = { db, hashPassword, DB_PATH };
