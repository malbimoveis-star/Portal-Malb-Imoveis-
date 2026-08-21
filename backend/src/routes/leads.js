'use strict';

const { db } = require('../db');
const { dispararWebhook } = require('../webhooks');

const STATUS_LABEL = {
  novo: 'Novo',
  em_atendimento: 'Em atendimento',
  convertido: 'Convertido',
  perdido: 'Perdido',
};

function rowToLead(row) {
  return {
    id: row.id,
    imovelId: row.imovel_id,
    nome: row.nome,
    contato: row.contato,
    mensagem: row.mensagem,
    status: row.status,
    corretorId: row.corretor_id,
    createdAt: row.created_at,
  };
}

function rowToInteracao(row) {
  return {
    id: row.id,
    leadId: row.lead_id,
    userId: row.user_id,
    userNome: row.user_nome || null,
    tipo: row.tipo,
    texto: row.texto,
    createdAt: row.created_at,
  };
}

// Registra uma entrada na linha do tempo do lead — usada tanto para notas
// digitadas pelo corretor quanto para os eventos automáticos (mudança de
// status, atribuição), assim o histórico completo do atendimento fica num
// lugar só, na ordem em que aconteceu.
function registrarInteracao(leadId, userId, tipo, texto) {
  db.prepare(`
    INSERT INTO lead_interacoes (lead_id, user_id, tipo, texto)
    VALUES (?, ?, ?, ?)
  `).run(leadId, userId || null, tipo, texto);
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
    registrarInteracao(row.id, null, 'sistema', 'Lead recebido pelo site.');

    // Se o lead é sobre um imóvel importado por um parceiro (Fase 4), avisa
    // o webhook dele — o CRM do parceiro recebe o lead quase em tempo real.
    if (row.imovel_id) {
      const imovel = db.prepare('SELECT * FROM imoveis WHERE id = ?').get(row.imovel_id);
      if (imovel && imovel.parceiro_id) {
        const parceiro = db.prepare('SELECT * FROM parceiros WHERE id = ?').get(imovel.parceiro_id);
        if (parceiro) {
          dispararWebhook(parceiro, 'lead.criado', {
            ...rowToLead(row),
            imovelReferenciaExterna: imovel.referencia_externa,
            imovelTitulo: imovel.titulo,
          });
        }
      }
    }

    res.json(201, { data: rowToLead(row) });
  });

  // GET /api/leads — protegido, usado pelo painel interno (CRM). Aceita
  // ?status= e ?corretorId= para o funil filtrar sem trazer tudo toda hora
  // (o painel hoje busca tudo de uma vez, mas isso já deixa a rota pronta
  // pra crescer sem quebrar quem já chama sem filtro nenhum).
  router.get('/api/leads', (req, res, params, query, body, user) => {
    if (!user) return res.json(401, { error: 'Autenticação necessária' });
    const clauses = [];
    const args = [];
    if (query.status) { clauses.push('status = ?'); args.push(query.status); }
    if (query.corretorId) { clauses.push('corretor_id = ?'); args.push(Number(query.corretorId)); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = db.prepare(`SELECT * FROM leads ${where} ORDER BY created_at DESC`).all(...args);
    res.json(200, { data: rows.map(rowToLead), total: rows.length });
  });

  router.get('/api/leads/:id', (req, res, params, query, body, user) => {
    if (!user) return res.json(401, { error: 'Autenticação necessária' });
    const row = db.prepare('SELECT * FROM leads WHERE id = ?').get(Number(params.id));
    if (!row) return res.json(404, { error: 'Lead não encontrado' });
    res.json(200, { data: rowToLead(row) });
  });

  router.put('/api/leads/:id', (req, res, params, query, body, user) => {
    if (!user) return res.json(401, { error: 'Autenticação necessária' });
    const id = Number(params.id);
    const existing = db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
    if (!existing) return res.json(404, { error: 'Lead não encontrado' });

    const status = body.status || existing.status;
    if (body.status && !STATUS_LABEL[body.status]) {
      return res.json(400, { error: 'Payload inválido', detalhes: ['status inválido'] });
    }
    // corretorId pode vir como null explicitamente (desatribuir); undefined
    // significa "não mexe nesse campo".
    const corretorId = body.corretorId !== undefined ? body.corretorId : existing.corretor_id;

    if (corretorId) {
      const corretor = db.prepare('SELECT id FROM users WHERE id = ? AND ativo = 1').get(Number(corretorId));
      if (!corretor) return res.json(400, { error: 'Corretor inválido ou inativo' });
    }

    db.prepare('UPDATE leads SET status = ?, corretor_id = ? WHERE id = ?').run(status, corretorId || null, id);

    if (body.status && body.status !== existing.status) {
      registrarInteracao(id, user.id, 'status', `Status alterado de "${STATUS_LABEL[existing.status]}" para "${STATUS_LABEL[status]}".`);
    }
    if (body.corretorId !== undefined && Number(corretorId) !== Number(existing.corretor_id)) {
      if (corretorId) {
        const nomeCorretor = db.prepare('SELECT nome FROM users WHERE id = ?').get(Number(corretorId));
        registrarInteracao(id, user.id, 'atribuicao', `Atribuído a ${nomeCorretor ? nomeCorretor.nome : 'um corretor'}.`);
      } else {
        registrarInteracao(id, user.id, 'atribuicao', 'Atribuição removida.');
      }
    }

    // Se o lead é de um imóvel de parceiro e o status mudou, o parceiro
    // também é avisado — mesmo padrão do webhook imovel.atualizado da Fase 4.
    if (body.status && body.status !== existing.status && existing.imovel_id) {
      const imovel = db.prepare('SELECT * FROM imoveis WHERE id = ?').get(existing.imovel_id);
      if (imovel && imovel.parceiro_id) {
        const parceiro = db.prepare('SELECT * FROM parceiros WHERE id = ?').get(imovel.parceiro_id);
        if (parceiro) {
          const row = db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
          dispararWebhook(parceiro, 'lead.atualizado', { ...rowToLead(row), imovelReferenciaExterna: imovel.referencia_externa });
        }
      }
    }

    const row = db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
    res.json(200, { data: rowToLead(row) });
  });

  // Linha do tempo do lead: notas do corretor + eventos automáticos
  // (recebimento, mudança de status, atribuição), mais antigo primeiro.
  router.get('/api/leads/:id/interacoes', (req, res, params, query, body, user) => {
    if (!user) return res.json(401, { error: 'Autenticação necessária' });
    const lead = db.prepare('SELECT id FROM leads WHERE id = ?').get(Number(params.id));
    if (!lead) return res.json(404, { error: 'Lead não encontrado' });
    const rows = db.prepare(`
      SELECT li.*, u.nome AS user_nome
      FROM lead_interacoes li
      LEFT JOIN users u ON u.id = li.user_id
      WHERE li.lead_id = ?
      ORDER BY li.created_at ASC, li.id ASC
    `).all(Number(params.id));
    res.json(200, { data: rows.map(rowToInteracao), total: rows.length });
  });

  router.post('/api/leads/:id/interacoes', (req, res, params, query, body, user) => {
    if (!user) return res.json(401, { error: 'Autenticação necessária' });
    const lead = db.prepare('SELECT id FROM leads WHERE id = ?').get(Number(params.id));
    if (!lead) return res.json(404, { error: 'Lead não encontrado' });
    if (!body.texto || !body.texto.trim()) {
      return res.json(400, { error: 'Payload inválido', detalhes: ['texto é obrigatório'] });
    }
    registrarInteracao(Number(params.id), user.id, 'nota', body.texto.trim());
    const row = db.prepare(`
      SELECT li.*, u.nome AS user_nome FROM lead_interacoes li
      LEFT JOIN users u ON u.id = li.user_id
      WHERE li.lead_id = ? ORDER BY li.id DESC LIMIT 1
    `).get(Number(params.id));
    res.json(201, { data: rowToInteracao(row) });
  });
}

module.exports = { registerLeadsRoutes, rowToLead };
