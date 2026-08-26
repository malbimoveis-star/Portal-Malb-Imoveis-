'use strict';

const { db } = require('../db');
const { gerarChaveApi, gerarWebhookSecret, requireParceiro } = require('../auth-parceiro');
const { rowToImovel, validarPayload, normalizarComposicao } = require('./imoveis');
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
  const fotosXml = (im.fotos && im.fotos.length ? im.fotos : (im.foto ? [im.foto] : []))
    .map((url, i) => `      <Item principal="${i === 0}">${escapeXml(url)}</Item>`).join('\n');
  return `  <Imovel>
    <Id>${im.id}</Id>
    <ReferenciaExterna>${escapeXml(im.referenciaExterna)}</ReferenciaExterna>
    <Tipo>${escapeXml(im.tipo)}</Tipo>
    <Finalidade>${escapeXml(im.finalidade)}</Finalidade>
    <Preco>${im.preco}</Preco>
    <Condominio>${im.condominio || 0}</Condominio>
    <Iptu>${im.iptu || 0}</Iptu>
    <Titulo>${escapeXml(im.titulo)}</Titulo>
    <Endereco>${escapeXml(im.endereco)}</Endereco>
    <Numero>${escapeXml(im.numero)}</Numero>
    <Complemento>${escapeXml(im.complemento)}</Complemento>
    <Cep>${escapeXml(im.cep)}</Cep>
    <Bairro>${escapeXml(im.bairro)}</Bairro>
    <Cidade>${escapeXml(im.cidade)}</Cidade>
    <Quartos>${im.quartos}</Quartos>
    <Suites>${im.suites || 0}</Suites>
    <Banheiros>${im.banheiros}</Banheiros>
    <Lavabos>${im.lavabos || 0}</Lavabos>
    <Vagas>${im.vagas}</Vagas>
    <VagasCobertas>${im.vagasCobertas || 0}</VagasCobertas>
    <VagasDescobertas>${im.vagasDescobertas || 0}</VagasDescobertas>
    <Area>${im.area}</Area>
    <AreaUtil>${im.areaUtil || 0}</AreaUtil>
    <AnoConstrucao>${im.anoConstrucao ?? ''}</AnoConstrucao>
    <Descricao>${escapeXml(im.descricao)}</Descricao>
    <Amenities>
${amenitiesXml}
    </Amenities>
    <Foto>${escapeXml(im.foto)}</Foto>
    <Fotos>
${fotosXml}
    </Fotos>
    <Latitude>${im.lat ?? ''}</Latitude>
    <Longitude>${im.lng ?? ''}</Longitude>
    <Status>${escapeXml(im.status)}</Status>
    <AtualizadoEm>${escapeXml(im.updatedAt)}</AtualizadoEm>
  </Imovel>`;
}

function registerParceirosRoutes(router) {
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

  router.get('/api/v1/parceiros/imoveis', (req, res) => {
    const parceiro = requireParceiro(req);
    if (!parceiro) return res.json(401, { error: 'Chave de API ausente ou inválida (header X-Api-Key)' });
    const rows = db.prepare("SELECT * FROM imoveis WHERE status = 'disponivel' ORDER BY updated_at DESC").all();
    res.json(200, { data: rows.map(rowToImovel), total: rows.length });
  });

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
      const comp = normalizarComposicao(body, rowToImovel(existing));
      db.prepare(`
        UPDATE imoveis SET
          tipo=?, finalidade=?, preco=?, titulo=?, endereco=?, numero=?, complemento=?, cep=?, bairro=?, cidade=?,
          quartos=?, suites=?, banheiros=?, lavabos=?, vagas=?, vagas_cobertas=?, vagas_descobertas=?,
          area=?, area_util=?, condominio=?, iptu=?, ano_construcao=?,
          descricao=?, amenities=?, foto=?, fotos=?, lat=?, lng=?, status=?, updated_at=datetime('now')
        WHERE id = ?
      `).run(
        body.tipo, body.finalidade, Number(body.preco), body.titulo,
        body.endereco || '', body.numero || '', body.complemento || '', body.cep || '',
        body.bairro, body.cidade,
        Number(body.quartos || 0), Number(body.suites || 0), Number(body.banheiros || 0), Number(body.lavabos || 0),
        comp.vagas, comp.vagasCobertas, comp.vagasDescobertas,
        Number(body.area || 0), Number(body.areaUtil || 0), Number(body.condominio || 0), Number(body.iptu || 0),
        body.anoConstrucao != null && body.anoConstrucao !== '' ? Number(body.anoConstrucao) : null,
        body.descricao || '', JSON.stringify(body.amenities || []), comp.foto, JSON.stringify(comp.fotos),
        body.lat != null && body.lat !== '' ? Number(body.lat) : null,
        body.lng != null && body.lng !== '' ? Number(body.lng) : null,
        body.status || existing.status, existing.id
      );
      const row = db.prepare('SELECT * FROM imoveis WHERE id = ?').get(existing.id);
      return res.json(200, { data: rowToImovel(row) });
    }

    const comp = normalizarComposicao(body, null);
    const info = db.prepare(`
      INSERT INTO imoveis (
        tipo, finalidade, preco, titulo, endereco, numero, complemento, cep, bairro, cidade,
        quartos, suites, banheiros, lavabos, vagas, vagas_cobertas, vagas_descobertas,
        area, area_util, condominio, iptu, ano_construcao,
        descricao, amenities, foto, fotos, lat, lng, status, origem, parceiro_id, referencia_externa
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'parceiro', ?, ?)
    `).run(
      body.tipo, body.finalidade, Number(body.preco), body.titulo,
      body.endereco || '', body.numero || '', body.complemento || '', body.cep || '',
      body.bairro, body.cidade,
      Number(body.quartos || 0), Number(body.suites || 0), Number(body.banheiros || 0), Number(body.lavabos || 0),
      comp.vagas, comp.vagasCobertas, comp.vagasDescobertas,
      Number(body.area || 0), Number(body.areaUtil || 0), Number(body.condominio || 0), Number(body.iptu || 0),
      body.anoConstrucao != null && body.anoConstrucao !== '' ? Number(body.anoConstrucao) : null,
      body.descricao || '', JSON.stringify(body.amenities || []), comp.foto, JSON.stringify(comp.fotos),
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

  router.post('/api/v1/parceiros/webhook-teste', (req, res) => {
    const parceiro = requireParceiro(req);
    if (!parceiro) return res.json(401, { error: 'Chave de API ausente ou inválida (header X-Api-Key)' });
    if (!parceiro.webhook_url) return res.json(400, { error: 'Este parceiro não tem webhook_url cadastrada' });
    dispararWebhook(parceiro, 'teste', { mensagem: 'Disparo de teste do Portal Malb Imóveis' });
    res.json(202, { data: { status: 'disparado' } });
  });
}

module.exports = { registerParceirosRoutes };
