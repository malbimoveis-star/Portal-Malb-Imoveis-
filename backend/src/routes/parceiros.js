'use strict';

/**
 * Fase 4 — API de integração com CRMs parceiros.
 *
 * Duas famílias de rotas aqui:
 *  - /api/parceiros/*        — gestão de parceiros pelo painel (sessão do corretor)
 *  - /api/v1/parceiros/*     — a API pública que o CRM do parceiro consome
 *                              (autenticada por chave de API, header X-Api-Key)
 *
 * O "v1" no caminho da API pública é proposital: é a superfície de contrato
 * com terceiros, então precisa poder evoluir (v2, v3...) sem quebrar quem já
 * integrou — diferente das rotas internas do painel, que podem mudar livre.
 */

const { db } = require('../db');
const { gerarChaveApi, gerarWebhookSecret, requireParceiro } = require('../auth-parceiro');
const { rowToImovel, validarPayload } = require('./imoveis');
const { dispararWebhook } = require('../webhooks');

function rowToParceiro(row, { comEstatisticas } = {}) {
  const base = {
    id: row.id,
    nome: row.nome,
    chavePrefixo: row.chave_prefixo,
    webhookUrl: row.webhook_url,
    ativo: !!row.ativo,
    createdAt: row.created_at,
  };
  if (comEstatisticas) {
    const { total } = db.prepare('SELECT COUNT(*) AS total FROM imoveis WHERE parceiro_id = ?').get(row.id);
    base.imoveisImportados = total;
  }
  return base;
}

function escapeXml(valor) {
  return String(valor ?? '').replace(/[<>&'"]/g, (c) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;',
  }[c]));
}

function imovelParaXml(im) {
  const amenitiesXml = (im.amenities || []).map((a) => `      <Item>${escapeXml(a)}</Item>`).join('\n');
  return `  <Imovel>
    <Id>${im.id}</Id>
    <ReferenciaExterna>${escapeXml(im.referenciaExterna)}</ReferenciaExterna>
    <Tipo>${escapeXml(im.tipo)}</Tipo>
    <Finalidade>${escapeXml(im.finalidade)}</Finalidade>
    <Preco>${im.preco}</Preco>
    <Titulo>${escapeXml(im.titulo)}</Titulo>
    <Bairro>${escapeXml(im.bairro)}</Bairro>
    <Cidade>${escapeXml(im.cidade)}</Cidade>
    <Quartos>${im.quartos}</Quartos>
    <Banheiros>${im.banheiros}</Banheiros>
    <Vagas>${im.vagas}</Vagas>
    <Area>${im.area}</Area>
    <Descricao>${escapeXml(im.descricao)}</Descricao>
    <Amenities>
${amenitiesXml}
    </Amenities>
    <Foto>${escapeXml(im.foto)}</Foto>
    <Latitude>${im.lat ?? ''}</Latitude>
    <Longitude>${im.lng ?? ''}</Longitude>
    <Status>${escapeXml(im.status)}</Status>
    <AtualizadoEm>${escapeXml(im.updatedAt)}</AtualizadoEm>
  </Imovel>`;
}

function registerParceirosRoutes(router) {
  // ---------------------------------------------------------------------
  // Gestão de parceiros pelo painel (sessão do corretor — mesmo padrão de
  // autenticação das rotas /api/imoveis e /api/leads)
  // ---------------------------------------------------------------------

  router.get('/api/parceiros', (req, res, params, query, body, user) => {
    if (!user) return res.json(401, { error: 'Autenticação necessária' });
    const rows = db.prepare('SELECT * FROM parceiros ORDER BY created_at DESC').all();
    res.json(200, { data: rows.map((r) => rowToParceiro(r, { comEstatisticas: true })), total: rows.length });
  });

  router.post('/api/parceiros', (req, res, params, query, body, user) => {
    if (!user) return res.json(401, { error: 'Autenticação necessária' });
    if (!body.nome) return res.json(400, { error: 'Payload inválido', detalhes: ['nome é obrigatório'] });

    const { chave, hash, prefixo } = gerarChaveApi();
    const webhookSecret = gerarWebhookSecret();
    const info = db.prepare(`
      INSERT INTO parceiros (nome, chave_hash, chave_prefixo, webhook_url, webhook_secret, ativo)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(body.nome, hash, prefixo, body.webhookUrl || null, webhookSecret);

    const row = db.prepare('SELECT * FROM parceiros WHERE id = ?').get(info.lastInsertRowid);
    // A chave em texto puro só existe neste momento — nunca mais é recuperável.
    res.json(201, { data: { ...rowToParceiro(row), chaveApi: chave, webhookSecret } });
  });

  router.put('/api/parceiros/:id', (req, res, params, query, body, user) => {
    if (!user) return res.json(401, { error: 'Autenticação necessária' });
    const existing = db.prepare('SELECT * FROM parceiros WHERE id = ?').get(Number(params.id));
    if (!existing) return res.json(404, { error: 'Parceiro não encontrado' });

    db.prepare(`
      UPDATE parceiros SET nome = ?, webhook_url = ?, ativo = ? WHERE id = ?
    `).run(
      body.nome ?? existing.nome,
      body.webhookUrl !== undefined ? body.webhookUrl : existing.webhook_url,
      body.ativo !== undefined ? (body.ativo ? 1 : 0) : existing.ativo,
      Number(params.id)
    );
    const row = db.prepare('SELECT * FROM parceiros WHERE id = ?').get(Number(params.id));
    res.json(200, { data: rowToParceiro(row) });
  });

  router.post('/api/parceiros/:id/regenerar-chave', (req, res, params, query, body, user) => {
    if (!user) return res.json(401, { error: 'Autenticação necessária' });
    const existing = db.prepare('SELECT * FROM parceiros WHERE id = ?').get(Number(params.id));
    if (!existing) return res.json(404, { error: 'Parceiro não encontrado' });

    const { chave, hash, prefixo } = gerarChaveApi();
    db.prepare('UPDATE parceiros SET chave_hash = ?, chave_prefixo = ? WHERE id = ?').run(hash, prefixo, Number(params.id));
    const row = db.prepare('SELECT * FROM parceiros WHERE id = ?').get(Number(params.id));
    res.json(200, { data: { ...rowToParceiro(row), chaveApi: chave } });
  });

  router.delete('/api/parceiros/:id', (req, res, params, query, body, user) => {
    if (!user) return res.json(401, { error: 'Autenticação necessária' });
    const info = db.prepare('DELETE FROM parceiros WHERE id = ?').run(Number(params.id));
    if (info.changes === 0) return res.json(404, { error: 'Parceiro não encontrado' });
    res.json(204, null);
  });

  router.get('/api/parceiros/:id/entregas', (req, res, params, query, body, user) => {
    if (!user) return res.json(401, { error: 'Autenticação necessária' });
    const rows = db.prepare(`
      SELECT * FROM webhook_entregas WHERE parceiro_id = ? ORDER BY created_at DESC LIMIT 50
    `).all(Number(params.id));
    res.json(200, {
      data: rows.map((r) => ({
        id: r.id, evento: r.evento, sucesso: !!r.sucesso, statusHttp: r.status_http, erro: r.erro, createdAt: r.created_at,
      })),
      total: rows.length,
    });
  });

  // ---------------------------------------------------------------------
  // API pública consumida pelo CRM do parceiro (autenticação por X-Api-Key)
  // ---------------------------------------------------------------------

  // Exportação: lista os imóveis ativos da Malb para o parceiro publicar.
  router.get('/api/v1/parceiros/imoveis', (req, res) => {
    const parceiro = requireParceiro(req);
    if (!parceiro) return res.json(401, { error: 'Chave de API ausente ou inválida (header X-Api-Key)' });
    const rows = db.prepare("SELECT * FROM imoveis WHERE status = 'disponivel' ORDER BY updated_at DESC").all();
    res.json(200, { data: rows.map(rowToImovel), total: rows.length });
  });

  // Mesma exportação, em XML — formato próprio documentado em docs/API.md,
  // inspirado nos feeds usados no mercado imobiliário (não é o schema
  // proprietário de nenhum portal específico).
  router.get('/api/v1/parceiros/imoveis.xml', (req, res) => {
    const parceiro = requireParceiro(req);
    if (!parceiro) return res.json(401, { error: 'Chave de API ausente ou inválida (header X-Api-Key)' });
    const rows = db.prepare("SELECT * FROM imoveis WHERE status = 'disponivel' ORDER BY updated_at DESC").all();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<Imoveis>\n${rows.map((r) => imovelParaXml(rowToImovel(r))).join('\n')}\n</Imoveis>`;
    res.xml(200, xml);
  });

  router.get('/api/v1/parceiros/imoveis/:id', (req, res, params) => {
    const parceiro = requireParceiro(req);
    if (!parceiro) return res.json(401, { error: 'Chave de API ausente ou inválida (header X-Api-Key)' });
    const row = db.prepare('SELECT * FROM imoveis WHERE id = ?').get(Number(params.id));
    if (!row) return res.json(404, { error: 'Imóvel não encontrado' });
    res.json(200, { data: rowToImovel(row) });
  });

  // Importação: o parceiro publica (cria ou atualiza) um imóvel dele no
  // catálogo da Malb, identificado pela referenciaExterna (o ID no sistema
  // do parceiro) — upsert por (parceiro_id, referencia_externa).
  router.post('/api/v1/parceiros/imoveis', (req, res, params, query, body) => {
    const parceiro = requireParceiro(req);
    if (!parceiro) return res.json(401, { error: 'Chave de API ausente ou inválida (header X-Api-Key)' });
    if (!body.referenciaExterna) {
      return res.json(400, { error: 'Payload inválido', detalhes: ['referenciaExterna é obrigatória para o parceiro poder atualizar depois'] });
    }
    const erros = validarPayload(body);
    if (erros.length) return res.json(400, { error: 'Payload inválido', detalhes: erros });

    const existing = db.prepare(`
      SELECT * FROM imoveis WHERE parceiro_id = ? AND referencia_externa = ?
    `).get(parceiro.id, body.referenciaExterna);

    if (existing) {
      db.prepare(`
        UPDATE imoveis SET tipo=?, finalidade=?, preco=?, titulo=?, bairro=?, cidade=?, quartos=?, banheiros=?, vagas=?, area=?, descricao=?, amenities=?, foto=?, lat=?, lng=?, status=?, updated_at=datetime('now')
        WHERE id = ?
      `).run(
        body.tipo, body.finalidade, Number(body.preco), body.titulo, body.bairro, body.cidade,
        Number(body.quartos || 0), Number(body.banheiros || 0), Number(body.vagas || 0), Number(body.area || 0),
        body.descricao || '', JSON.stringify(body.amenities || []), body.foto || '',
        body.lat != null && body.lat !== '' ? Number(body.lat) : null,
        body.lng != null && body.lng !== '' ? Number(body.lng) : null,
        body.status || existing.status, existing.id
      );
      const row = db.prepare('SELECT * FROM imoveis WHERE id = ?').get(existing.id);
      return res.json(200, { data: rowToImovel(row) });
    }

    const info = db.prepare(`
      INSERT INTO imoveis (tipo, finalidade, preco, titulo, bairro, cidade, quartos, banheiros, vagas, area, descricao, amenities, foto, lat, lng, status, origem, parceiro_id, referencia_externa)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'parceiro', ?, ?)
    `).run(
      body.tipo, body.finalidade, Number(body.preco), body.titulo, body.bairro, body.cidade,
      Number(body.quartos || 0), Number(body.banheiros || 0), Number(body.vagas || 0), Number(body.area || 0),
      body.descricao || '', JSON.stringify(body.amenities || []), body.foto || '',
      body.lat != null && body.lat !== '' ? Number(body.lat) : null,
      body.lng != null && body.lng !== '' ? Number(body.lng) : null,
      body.status || 'disponivel', parceiro.id, body.referenciaExterna
    );
    const row = db.prepare('SELECT * FROM imoveis WHERE id = ?').get(info.lastInsertRowid);
    res.json(201, { data: rowToImovel(row) });
  });

  router.delete('/api/v1/parceiros/imoveis/:referenciaExterna', (req, res, params) => {
    const parceiro = requireParceiro(req);
    if (!parceiro) return res.json(401, { error: 'Chave de API ausente ou inválida (header X-Api-Key)' });
    const info = db.prepare(`
      DELETE FROM imoveis WHERE parceiro_id = ? AND referencia_externa = ?
    `).run(parceiro.id, params.referenciaExterna);
    if (info.changes === 0) return res.json(404, { error: 'Imóvel não encontrado para esse parceiro/referência' });
    res.json(204, null);
  });

  // Endpoint de teste: dispara um webhook de exemplo para o parceiro
  // confirmar que a URL cadastrada está recebendo entregas corretamente.
  router.post('/api/v1/parceiros/webhook-teste', (req, res) => {
    const parceiro = requireParceiro(req);
    if (!parceiro) return res.json(401, { error: 'Chave de API ausente ou inválida (header X-Api-Key)' });
    if (!parceiro.webhook_url) return res.json(400, { error: 'Este parceiro não tem webhook_url cadastrada' });
    dispararWebhook(parceiro, 'teste', { mensagem: 'Disparo de teste do Portal Malb Imóveis' });
    res.json(202, { data: { status: 'disparado' } });
  });
}

module.exports = { registerParceirosRoutes };
