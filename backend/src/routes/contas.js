'use strict';

/**
 * Fase 7 — Cadastro de anunciantes (corretores autônomos e imobiliárias que
 * querem anunciar imóveis no portal), planos e checkout.
 *
 * Isso é um sistema de login separado do `users`/`sessions` usado pelo painel
 * interno (/admin) da Malb Imóveis. Aqui, `contas` são clientes do portal —
 * cada um com seu próprio plano — autenticados pela tabela `contas_sessions`,
 * com o mesmo padrão de token Bearer usado no resto da API.
 *
 * Checkout: por enquanto é SIMULADO — não existe nenhuma cobrança real ainda
 * (nenhuma integração de pagamento configurada). Confirmar o checkout já
 * ativa a assinatura na hora, só pra deixar o fluxo testável ponta a ponta.
 * Quando um meio de pagamento de verdade for escolhido (ex: Mercado Pago),
 * é só trocar o miolo de `POST /api/checkout` — o resto (planos, cadastro,
 * login) não muda.
 */

const crypto = require('node:crypto');
const { db, hashPassword } = require('../db');
const { rowToImovel } = require('./imoveis');

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 dias, igual ao login do painel interno

function rowToPlano(row) {
  return {
    id: row.id,
    tipo: row.tipo,
    nome: row.nome,
    precoMensal: row.preco_mensal,
    limiteAnuncios: row.limite_anuncios,
    destaque: !!row.destaque,
    descricao: row.descricao,
    recursos: JSON.parse(row.recursos || '[]'),
    ordem: row.ordem,
  };
}

function rowToConta(row) {
  return {
    id: row.id,
    tipo: row.tipo,
    nome: row.nome,
    nomeFantasia: row.nome_fantasia,
    cnpj: row.cnpj,
    cpf: row.cpf,
    creci: row.creci,
    email: row.email,
    telefone: row.telefone,
    planoId: row.plano_id,
    statusAssinatura: row.status_assinatura,
    ativo: !!row.ativo,
    createdAt: row.created_at,
  };
}

function verifySenha(senha, salt, hashEsperado) {
  const { hash } = hashPassword(senha, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(hashEsperado, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function getContaFromToken(token) {
  if (!token) return null;
  const session = db.prepare('SELECT * FROM contas_sessions WHERE token = ?').get(token);
  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM contas_sessions WHERE token = ?').run(token);
    return null;
  }
  const conta = db.prepare('SELECT * FROM contas WHERE id = ?').get(session.conta_id);
  if (!conta || !conta.ativo) return null;
  return conta;
}

function registerContasRoutes(router) {
  // Lista de planos, pública — usada na página /planos.html. ?tipo=corretor
  // ou ?tipo=imobiliaria filtra; sem o parâmetro, devolve os dois tipos.
  router.get('/api/planos', (req, res, params, query) => {
    const tipo = query.tipo === 'corretor' || query.tipo === 'imobiliaria' ? query.tipo : null;
    const rows = tipo
      ? db.prepare('SELECT * FROM planos WHERE ativo = 1 AND tipo = ? ORDER BY ordem').all(tipo)
      : db.prepare('SELECT * FROM planos WHERE ativo = 1 ORDER BY tipo, ordem').all();
    res.json(200, { data: rows.map(rowToPlano) });
  });

  // Cadastro de conta (corretor ou imobiliária). Campos exigidos mudam
  // conforme o tipo: os dois precisam de CRECI; imobiliária também precisa
  // de razão social (nome) e CNPJ.
  router.post('/api/contas', (req, res, params, query, body) => {
    const tipo = body.tipo === 'imobiliaria' ? 'imobiliaria' : body.tipo === 'corretor' ? 'corretor' : null;
    if (!tipo) return res.json(400, { error: 'Payload inválido', detalhes: ['tipo deve ser "corretor" ou "imobiliaria"'] });

    const erros = [];
    if (!body.nome) erros.push('nome é obrigatório');
    if (!body.email) erros.push('email é obrigatório');
    if (!body.creci) erros.push('CRECI é obrigatório');
    if (!body.senha || String(body.senha).length < 6) erros.push('senha deve ter pelo menos 6 caracteres');
    if (tipo === 'imobiliaria' && !body.cnpj) erros.push('CNPJ é obrigatório para imobiliária');
    if (erros.length) return res.json(400, { error: 'Payload inválido', detalhes: erros });

    const existente = db.prepare('SELECT id FROM contas WHERE email = ?').get(body.email);
    if (existente) return res.json(409, { error: 'Já existe uma conta com esse e-mail' });

    const { hash, salt } = hashPassword(body.senha);
    const info = db.prepare(`
      INSERT INTO contas (tipo, nome, nome_fantasia, cnpj, cpf, creci, email, telefone, senha_hash, senha_salt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      tipo,
      body.nome,
      tipo === 'imobiliaria' ? (body.nomeFantasia || null) : null,
      tipo === 'imobiliaria' ? body.cnpj : null,
      tipo === 'corretor' ? (body.cpf || null) : null,
      body.creci,
      body.email,
      body.telefone || null,
      hash,
      salt
    );

    const row = db.prepare('SELECT * FROM contas WHERE id = ?').get(info.lastInsertRowid);

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    db.prepare('INSERT INTO contas_sessions (token, conta_id, expires_at) VALUES (?, ?, ?)').run(token, row.id, expiresAt);

    res.json(201, { data: rowToConta(row), token });
  });

  router.post('/api/contas/login', (req, res, params, query, body) => {
    if (!body.email || !body.senha) return res.json(400, { error: 'Payload inválido', detalhes: ['email e senha são obrigatórios'] });

    const conta = db.prepare('SELECT * FROM contas WHERE email = ?').get(body.email);
    if (!conta || !verifySenha(body.senha, conta.senha_salt, conta.senha_hash) || !conta.ativo) {
      return res.json(401, { error: 'E-mail ou senha inválidos' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    db.prepare('INSERT INTO contas_sessions (token, conta_id, expires_at) VALUES (?, ?, ?)').run(token, conta.id, expiresAt);

    res.json(200, { data: rowToConta(conta), token });
  });

  router.get('/api/contas/me', (req, res, params, query, body, user, token) => {
    const conta = getContaFromToken(token);
    if (!conta) return res.json(401, { error: 'Autenticação necessária' });
    const plano = conta.plano_id ? db.prepare('SELECT * FROM planos WHERE id = ?').get(conta.plano_id) : null;
    res.json(200, { data: { ...rowToConta(conta), plano: plano ? rowToPlano(plano) : null } });
  });

  // Fase 7.1 — painel do anunciante: os próprios imóveis da conta logada.
  router.get('/api/contas/me/imoveis', (req, res, params, query, body, user, token) => {
    const conta = getContaFromToken(token);
    if (!conta) return res.json(401, { error: 'Autenticação necessária' });
    const rows = db.prepare('SELECT * FROM imoveis WHERE conta_id = ? ORDER BY created_at DESC').all(conta.id);
    res.json(200, { data: rows.map(rowToImovel), total: rows.length });
  });

  // Estatísticas básicas do anunciante: quantos imóveis tem (e em que
  // status) e quantos leads os imóveis dele já receberam. Não tem contagem
  // de visualizações/origem de tráfego ainda — isso fica pra uma etapa
  // seguinte (precisa de um sistema de rastreamento que ainda não existe).
  router.get('/api/contas/me/stats', (req, res, params, query, body, user, token) => {
    const conta = getContaFromToken(token);
    if (!conta) return res.json(401, { error: 'Autenticação necessária' });

    const { total: totalImoveis } = db.prepare('SELECT COUNT(*) AS total FROM imoveis WHERE conta_id = ?').get(conta.id);
    const { total: imoveisDisponiveis } = db.prepare("SELECT COUNT(*) AS total FROM imoveis WHERE conta_id = ? AND status = 'disponivel'").get(conta.id);
    const { total: totalLeads } = db.prepare(`
      SELECT COUNT(*) AS total FROM leads l JOIN imoveis i ON i.id = l.imovel_id WHERE i.conta_id = ?
    `).get(conta.id);
    const porStatusRows = db.prepare(`
      SELECT l.status AS status, COUNT(*) AS total FROM leads l JOIN imoveis i ON i.id = l.imovel_id
      WHERE i.conta_id = ? GROUP BY l.status
    `).all(conta.id);
    const leadsPorStatus = { novo: 0, em_atendimento: 0, convertido: 0, perdido: 0 };
    porStatusRows.forEach((r) => { leadsPorStatus[r.status] = r.total; });

    res.json(200, { data: { totalImoveis, imoveisDisponiveis, totalLeads, leadsPorStatus } });
  });

  // Checkout SIMULADO — ver comentário no topo do arquivo. Ativa a
  // assinatura na hora, sem cobrar nada de verdade.
  router.post('/api/checkout', (req, res, params, query, body, user, token) => {
    const conta = getContaFromToken(token);
    if (!conta) return res.json(401, { error: 'Autenticação necessária' });

    const planoId = Number(body.planoId);
    const plano = db.prepare('SELECT * FROM planos WHERE id = ? AND ativo = 1').get(planoId);
    if (!plano) return res.json(404, { error: 'Plano não encontrado' });
    if (plano.tipo !== conta.tipo) {
      return res.json(400, { error: `Esse plano é para ${plano.tipo === 'corretor' ? 'corretores' : 'imobiliárias'}, sua conta é de ${conta.tipo === 'corretor' ? 'corretor' : 'imobiliária'}` });
    }

    const info = db.prepare(`
      INSERT INTO assinaturas (conta_id, plano_id, status, metodo_pagamento, simulado)
      VALUES (?, ?, 'ativa', 'simulado', 1)
    `).run(conta.id, plano.id);

    db.prepare('UPDATE contas SET plano_id = ?, status_assinatura = ? WHERE id = ?').run(plano.id, 'ativa', conta.id);

    const assinatura = db.prepare('SELECT * FROM assinaturas WHERE id = ?').get(info.lastInsertRowid);
    res.json(201, {
      data: {
        id: assinatura.id,
        plano: rowToPlano(plano),
        status: assinatura.status,
        simulado: true,
        inicio: assinatura.inicio,
      },
      aviso: 'Checkout simulado — nenhuma cobrança real foi feita ainda. A integração de pagamento de verdade fica para uma próxima etapa.',
    });
  });

  // Fase 7.1 — visibilidade das contas de anunciante dentro do CRM interno.
  // Protegida pelo login do painel (/admin), não pelo login de conta — é
  // assim que a equipe da Malb acompanha quem assinou o quê.
  router.get('/api/contas', (req, res, params, query, body, user) => {
    if (!user) return res.json(401, { error: 'Autenticação necessária' });
    const rows = db.prepare(`
      SELECT c.*, p.nome AS plano_nome, p.preco_mensal AS plano_preco,
        (SELECT COUNT(*) FROM imoveis i WHERE i.conta_id = c.id) AS total_imoveis,
        (SELECT COUNT(*) FROM leads l JOIN imoveis i ON i.id = l.imovel_id WHERE i.conta_id = c.id) AS total_leads
      FROM contas c
      LEFT JOIN planos p ON p.id = c.plano_id
      ORDER BY c.created_at DESC
    `).all();
    const data = rows.map((row) => ({
      ...rowToConta(row),
      planoNome: row.plano_nome || null,
      planoPreco: row.plano_preco != null ? row.plano_preco : null,
      totalImoveis: row.total_imoveis,
      totalLeads: row.total_leads,
    }));
    res.json(200, { data, total: data.length });
  });
}

module.exports = { registerContasRoutes, getContaFromToken, rowToConta, rowToPlano };
