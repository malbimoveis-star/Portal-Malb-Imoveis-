'use strict';

const { db } = require('../db');

function rowToLead(row) {
  return {
    id: row.id,
    imovelId: row.imovel_id,
    nome: row.nome,
    contato: row.contato,
    mensagem: row.mensagem,
    status: row.status,
    createdAt: row.created_at,
  };
}

function registerLeadsRoutes(router) {
  // POST /api/leads — endpoint público, usado pelo formulário "Enviar interesse"
  router.post('/api/leads', (req, res, params, query, body) => {
    if (!body.nome || !body.contato) {
      return res.json(400, { error: 'Payload inválido', detalhes: ['nome e contato são obrigatórios'] });
    }
    const info = db.prepare(`
      INSERT INTO leads (imovel_id, nome, contato, mensagem)
      VALUES (?, ?, ?, ?)
    `).run(body.imovelId || null, body.nome, body.contato, body.mensagem || '');
    const row = db.prepare('SELECT * FROM leads WHERE id = ?').get(info.lastInsertRowid);
    res.json(201, { data: rowToLead(row) });
  });

  // GET /api/leads — protegido, usado pelo painel interno (CRM)
  router.get('/api/leads', (req, res, params, query, body, user) => {
    if (!user) return res.json(401, { error: 'Autenticação necessária' });
    const rows = db.prepare('SELECT * FROM leads ORDER BY created_at DESC').all();
    res.json(200, { data: rows.map(rowToLead), total: rows.length });
  });

  router.put('/api/leads/:id', (req, res, params, query, body, user) => {
    if (!user) return res.json(401, { error: 'Autenticação necessária' });
    const existing = db.prepare('SELECT * FROM leads WHERE id = ?').get(Number(params.id));
    if (!existing) return res.json(404, { error: 'Lead não encontrado' });
    const status = body.status || existing.status;
    db.prepare('UPDATE leads SET status = ? WHERE id = ?').run(status, Number(params.id));
    const row = db.prepare('SELECT * FROM leads WHERE id = ?').get(Number(params.id));
    res.json(200, { data: rowToLead(row) });
  });
}

module.exports = { registerLeadsRoutes };
