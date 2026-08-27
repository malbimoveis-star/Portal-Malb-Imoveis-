'use strict';

const { db } = require('../db');
const { dispararWebhook } = require('../webhooks');

// Fase 7.2 — galeria de fotos por imóvel, com limite combinado com o
// cliente. `foto` (singular) segue existindo como "capa" — a primeira foto
// da galeria — pra nenhuma outra página precisar mudar pra continuar
// mostrando uma imagem de cada imóvel.
const MAX_FOTOS = 50;

// Decide a lista de fotos final a partir do body recebido:
// - body.fotos (array) presente → usa ela (até MAX_FOTOS, descartando itens
//   vazios) — inclusive um array vazio, que limpa a galeria de propósito.
// - senão, body.foto (string, formato antigo) presente → vira galeria de 1.
// - senão (nenhum dos dois veio) → mantém o que já existia (edição parcial).
function resolverFotos(body, fotosExistentesJson) {
  if (Array.isArray(body.fotos)) {
    return body.fotos.filter((f) => typeof f === 'string' && f.trim() !== '').slice(0, MAX_FOTOS);
  }
  if (body.foto !== undefined) {
    const f = String(body.foto || '').trim();
    return f ? [f] : [];
  }
  return JSON.parse(fotosExistentesJson || '[]');
}

function rowToImovel(row) {
  return {
    id: row.id,
    tipo: row.tipo,
    finalidade: row.finalidade,
    preco: row.preco,
    titulo: row.titulo,
    bairro: row.bairro,
    cidade: row.cidade,
    quartos: row.quartos,
    banheiros: row.banheiros,
    vagas: row.vagas,
    area: row.area,
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
  return erros;
}

function registerImoveisRoutes(router) {
  // GET /api/imoveis?finalidade=&tipo=&quartosMin=&precoMax=&cidade=&bairro=&q=
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
    // por padrão só mostra disponíveis, a menos que status=all seja pedido (uso do admin)
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

    // contaId (opcional) liga o imóvel a uma conta de anunciante (corretor ou
    // imobiliária) — só quem tem login no painel interno pode definir isso
    // (o próprio anunciante ainda não cadastra imóveis direto, Fase 7.1).
    let contaId = null;
    if (body.contaId != null && body.contaId !== '') {
      const conta = db.prepare('SELECT id FROM contas WHERE id = ?').get(Number(body.contaId));
      if (!conta) return res.json(400, { error: 'Payload inválido', detalhes: ['contaId não corresponde a uma conta existente'] });
      contaId = conta.id;
    }

    const fotos = resolverFotos(body, '[]');

    const info = db.prepare(`
      INSERT INTO imoveis (tipo, finalidade, preco, titulo, bairro, cidade, quartos, banheiros, vagas, area, descricao, amenities, foto, fotos, lat, lng, status, conta_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      body.tipo, body.finalidade, Number(body.preco), body.titulo, body.bairro, body.cidade,
      Number(body.quartos || 0), Number(body.banheiros || 0), Number(body.vagas || 0), Number(body.area || 0),
      body.descricao || '', JSON.stringify(body.amenities || []), fotos[0] || '', JSON.stringify(fotos),
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

    // contaId pode vir como null explicitamente (desvincular do anunciante);
    // undefined (campo ausente no body) significa "não mexe nesse campo".
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

    const fotos = resolverFotos(body, existing.fotos);

    db.prepare(`
      UPDATE imoveis SET tipo=?, finalidade=?, preco=?, titulo=?, bairro=?, cidade=?, quartos=?, banheiros=?, vagas=?, area=?, descricao=?, amenities=?, foto=?, fotos=?, lat=?, lng=?, status=?, conta_id=?, updated_at=datetime('now')
      WHERE id = ?
    `).run(
      merged.tipo, merged.finalidade, Number(merged.preco), merged.titulo, merged.bairro, merged.cidade,
      Number(merged.quartos || 0), Number(merged.banheiros || 0), Number(merged.vagas || 0), Number(merged.area || 0),
      merged.descricao || '', JSON.stringify(merged.amenities || []), fotos[0] || '', JSON.stringify(fotos),
      merged.lat != null && merged.lat !== '' ? Number(merged.lat) : null,
      merged.lng != null && merged.lng !== '' ? Number(merged.lng) : null,
      merged.status || 'disponivel', contaId, Number(params.id)
    );
    const row = db.prepare('SELECT * FROM imoveis WHERE id = ?').get(Number(params.id));

    // Se o imóvel veio de um parceiro (Fase 4) e o status mudou, avisa o
    // webhook dele — assim o CRM do parceiro fica sincronizado sem precisar
    // ficar consultando a API o tempo todo.
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

module.exports = { registerImoveisRoutes, rowToImovel, validarPayload, resolverFotos, MAX_FOTOS };
