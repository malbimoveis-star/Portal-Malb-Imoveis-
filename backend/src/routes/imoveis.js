'use strict';

const { db } = require('../db');
const { dispararWebhook } = require('../webhooks');

function rowToImovel(row) {
  return {
    id: row.id,
    tipo: row.tipo,
    finalidade: row.finalidade,
    preco: row.preco,
    titulo: row.titulo,
    endereco: row.endereco || '',
    numero: row.numero || '',
    complemento: row.complemento || '',
    cep: row.cep || '',
    bairro: row.bairro,
    cidade: row.cidade,
    quartos: row.quartos,
    suites: row.suites || 0,
    banheiros: row.banheiros,
    lavabos: row.lavabos || 0,
    vagas: row.vagas,
    vagasCobertas: row.vagas_cobertas || 0,
    vagasDescobertas: row.vagas_descobertas || 0,
    area: row.area,
    areaUtil: row.area_util || 0,
    condominio: row.condominio || 0,
    iptu: row.iptu || 0,
    anoConstrucao: row.ano_construcao || null,
    descricao: row.descricao,
    amenities: JSON.parse(row.amenities || '[]'),
    foto: row.foto,
    fotos: JSON.parse(row.fotos || '[]'),
    lat: row.lat,
    lng: row.lng,
    status: row.status,
    origem: row.origem || 'proprio',
    parceiroId: row.parceiro_id,
    referenciaExterna: row.referencia_externa,
    contaId: row.conta_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const CAMPOS_OBRIGATORIOS = ['tipo', 'finalidade', 'preco', 'titulo', 'bairro', 'cidade'];

function validarPayload(body) {
  const erros = [];
  for (const campo of CAMPOS_OBRIGATORIOS) {
    if (body[campo] === undefined || body[campo] === null || body[campo] === '') {
      erros.push(`Campo obrigatório ausente: ${campo}`);
    }
  }
  if (body.finalidade && !['venda', 'aluguel'].includes(body.finalidade)) {
    erros.push('finalidade deve ser "venda" ou "aluguel"');
  }
  if (body.preco !== undefined && Number.isNaN(Number(body.preco))) {
    erros.push('preco deve ser numérico');
  }
  if (body.fotos !== undefined && !Array.isArray(body.fotos)) {
    erros.push('fotos deve ser uma lista de URLs/imagens');
  }
  return erros;
}

function normalizarComposicao(body, existente) {
  const vagasCobertas = body.vagasCobertas !== undefined ? Number(body.vagasCobertas || 0) : (existente ? existente.vagasCobertas : 0);
  const vagasDescobertas = body.vagasDescobertas !== undefined ? Number(body.vagasDescobertas || 0) : (existente ? existente.vagasDescobertas : 0);
  const vagasDerivadas = body.vagasCobertas !== undefined || body.vagasDescobertas !== undefined
    ? vagasCobertas + vagasDescobertas
    : (body.vagas !== undefined ? Number(body.vagas || 0) : (existente ? existente.vagas : 0));

  let fotos = body.fotos !== undefined ? body.fotos : (existente ? existente.fotos : []);
  if (!Array.isArray(fotos)) fotos = [];
  const foto = body.foto !== undefined ? body.foto : (fotos.length ? fotos[0] : (existente ? existente.foto : ''));

  return { vagasCobertas, vagasDescobertas, vagas: vagasDerivadas, fotos, foto: foto || '' };
}

function registerImoveisRoutes(router) {
  router.get('/api/imoveis', (req, res, params, query) => {
    const clauses = [];
    const args = [];

    if (query.finalidade) { clauses.push('finalidade = ?'); args.push(query.finalidade); }
    if (query.tipo) { clauses.push('tipo = ?'); args.push(query.tipo); }
    if (query.quartosMin) { clauses.push('quartos >= ?'); args.push(Number(query.quartosMin)); }
    if (query.precoMax) { clauses.push('preco <= ?'); args.push(Number(query.precoMax)); }
    if (query.areaMin) { clauses.push('area >= ?'); args.push(Number(query.areaMin)); }
    if (query.areaMax) { clauses.push('area <= ?'); args.push(Number(query.areaMax)); }
    if (query.cidade) { clauses.push('cidade = ?'); args.push(query.cidade); }
    if (query.bairro) { clauses.push('bairro = ?'); args.push(query.bairro); }
    if (query.q) {
      clauses.push('(titulo LIKE ? OR bairro LIKE ? OR cidade LIKE ?)');
      const like = `%${query.q}%`;
      args.push(like, like, like);
    }
    if (query.status && query.status !== 'all') {
      clauses.push('status = ?'); args.push(query.status);
    } else if (!query.status) {
      clauses.push("status = 'disponivel'");
    }

    const ORDENS = {
      recentes: 'created_at DESC',
      preco_asc: 'preco ASC',
      preco_desc: 'preco DESC',
      area_desc: 'area DESC',
    };
    const orderBy = ORDENS[query.orderBy] || ORDENS.recentes;

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = db.prepare(`SELECT * FROM imoveis ${where} ORDER BY ${orderBy}`).all(...args);
    res.json(200, { data: rows.map(rowToImovel), total: rows.length });
  });

  router.get('/api/imoveis/:id', (req, res, params) => {
    const row = db.prepare('SELECT * FROM imoveis WHERE id = ?').get(Number(params.id));
    if (!row) return res.json(404, { error: 'Imóvel não encontrado' });
    res.json(200, { data: rowToImovel(row) });
  });

  router.post('/api/imoveis', (req, res, params, query, body, user) => {
    if (!user) return res.json(401, { error: 'Autenticação necessária' });
    const erros = validarPayload(body);
    if (erros.length) return res.json(400, { error: 'Payload inválido', detalhes: erros });

    let contaId = null;
    if (body.contaId != null && body.contaId !== '') {
      const conta = db.prepare('SELECT id FROM contas WHERE id = ?').get(Number(body.contaId));
      if (!conta) return res.json(400, { error: 'Payload inválido', detalhes: ['contaId não corresponde a uma conta existente'] });
      contaId = conta.id;
    }

    const comp = normalizarComposicao(body, null);

    const info = db.prepare(`
      INSERT INTO imoveis (
        tipo, finalidade, preco, titulo, endereco, numero, complemento, cep, bairro, cidade,
        quartos, suites, banheiros, lavabos, vagas, vagas_cobertas, vagas_descobertas,
        area, area_util, condominio, iptu, ano_construcao,
        descricao, amenities, foto, fotos, lat, lng, status, conta_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      body.status || 'disponivel',
      contaId
    );
    const row = db.prepare('SELECT * FROM imoveis WHERE id = ?').get(info.lastInsertRowid);
    res.json(201, { data: rowToImovel(row) });
  });

  router.put('/api/imoveis/:id', (req, res, params, query, body, user) => {
    if (!user) return res.json(401, { error: 'Autenticação necessária' });
    const existing = db.prepare('SELECT * FROM imoveis WHERE id = ?').get(Number(params.id));
    if (!existing) return res.json(404, { error: 'Imóvel não encontrado' });

    const merged = { ...rowToImovel(existing), ...body };
    const erros = validarPayload(merged);
    if (erros.length) return res.json(400, { error: 'Payload inválido', detalhes: erros });

    let contaId = existing.conta_id;
    if (body.contaId !== undefined) {
      if (body.contaId === null || body.contaId === '') {
        contaId = null;
      } else {
        const conta = db.prepare('SELECT id FROM contas WHERE id = ?').get(Number(body.contaId));
        if (!conta) return res.json(400, { error: 'Payload inválido', detalhes: ['contaId não corresponde a uma conta existente'] });
        contaId = conta.id;
      }
    }

    const comp = normalizarComposicao(body, rowToImovel(existing));

    db.prepare(`
      UPDATE imoveis SET
        tipo=?, finalidade=?, preco=?, titulo=?, endereco=?, numero=?, complemento=?, cep=?, bairro=?, cidade=?,
        quartos=?, suites=?, banheiros=?, lavabos=?, vagas=?, vagas_cobertas=?, vagas_descobertas=?,
        area=?, area_util=?, condominio=?, iptu=?, ano_construcao=?,
        descricao=?, amenities=?, foto=?, fotos=?, lat=?, lng=?, status=?, conta_id=?, updated_at=datetime('now')
      WHERE id = ?
    `).run(
      merged.tipo, merged.finalidade, Number(merged.preco), merged.titulo,
      merged.endereco || '', merged.numero || '', merged.complemento || '', merged.cep || '',
      merged.bairro, merged.cidade,
      Number(merged.quartos || 0), Number(merged.suites || 0), Number(merged.banheiros || 0), Number(merged.lavabos || 0),
      comp.vagas, comp.vagasCobertas, comp.vagasDescobertas,
      Number(merged.area || 0), Number(merged.areaUtil || 0), Number(merged.condominio || 0), Number(merged.iptu || 0),
      merged.anoConstrucao != null && merged.anoConstrucao !== '' ? Number(merged.anoConstrucao) : null,
      merged.descricao || '', JSON.stringify(merged.amenities || []), comp.foto, JSON.stringify(comp.fotos),
      merged.lat != null && merged.lat !== '' ? Number(merged.lat) : null,
      merged.lng != null && merged.lng !== '' ? Number(merged.lng) : null,
      merged.status || 'disponivel', contaId, Number(params.id)
    );
    const row = db.prepare('SELECT * FROM imoveis WHERE id = ?').get(Number(params.id));

    if (row.parceiro_id && existing.status !== row.status) {
      const parceiro = db.prepare('SELECT * FROM parceiros WHERE id = ?').get(row.parceiro_id);
      if (parceiro) dispararWebhook(parceiro, 'imovel.atualizado', rowToImovel(row));
    }

    res.json(200, { data: rowToImovel(row) });
  });

  router.delete('/api/imoveis/:id', (req, res, params, query, body, user) => {
    if (!user) return res.json(401, { error: 'Autenticação necessária' });
    const info = db.prepare('DELETE FROM imoveis WHERE id = ?').run(Number(params.id));
    if (info.changes === 0) return res.json(404, { error: 'Imóvel não encontrado' });
    res.json(204, null);
  });
}

module.exports = { registerImoveisRoutes, rowToImovel, validarPayload, normalizarComposicao, CAMPOS_OBRIGATORIOS };
