'use strict';

/**
 * Backup do banco SQLite — Fase 6.
 *
 * Usa `VACUUM INTO`, um comando do próprio SQLite que gera uma cópia
 * consistente do banco enquanto ele continua aberto e em uso pelo servidor
 * (diferente de um `cp` do arquivo, que pode pegar o banco no meio de uma
 * escrita e gerar uma cópia corrompida). Não precisa de nenhum pacote de
 * npm nem do binário `sqlite3` — só o módulo nativo `node:sqlite`.
 *
 * Uso:
 *   node scripts/backup-db.js
 *
 * Agendamento sugerido (crontab, todo dia às 3h da manhã):
 *   0 3 * * * cd /caminho/do/projeto/backend && node scripts/backup-db.js >> /var/log/malb-backup.log 2>&1
 *
 * Por padrão mantém os últimos 14 backups e apaga os mais antigos — ajuste
 * RETENCAO_MAX abaixo se quiser guardar mais ou menos histórico.
 */

const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { DB_PATH } = require('../src/db');

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '..', 'data', 'backups');
const RETENCAO_MAX = parseInt(process.env.BACKUP_RETENTION, 10) || 14;

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function backup() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`Banco não encontrado em ${DB_PATH} — nada para fazer backup.`);
    process.exit(1);
  }
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const destino = path.join(BACKUP_DIR, `malb-${timestamp()}.db`);
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  try {
    // VACUUM INTO exige um caminho literal na query (não aceita parâmetro
    // ligado), então escapamos aspas simples manualmente — o caminho vem de
    // variáveis internas (BACKUP_DIR), não de entrada externa.
    const destinoEscapado = destino.replace(/'/g, "''");
    db.exec(`VACUUM INTO '${destinoEscapado}'`);
  } finally {
    db.close();
  }

  const tamanhoKb = (fs.statSync(destino).size / 1024).toFixed(1);
  console.log(`Backup criado: ${destino} (${tamanhoKb} KB)`);

  prunar();
}

function prunar() {
  const arquivos = fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('malb-') && f.endsWith('.db'))
    .map((f) => ({ nome: f, caminho: path.join(BACKUP_DIR, f), mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  const excedentes = arquivos.slice(RETENCAO_MAX);
  for (const arquivo of excedentes) {
    fs.unlinkSync(arquivo.caminho);
    console.log(`Backup antigo removido: ${arquivo.nome}`);
  }
}

backup();
