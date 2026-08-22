'use strict';

/**
 * Fase 5 — gestão da equipe (corretores) para o CRM interno.
 *
 * Todo usuário autenticado pode LISTAR a equipe (precisa disso pra atribuir
 * leads a um corretor). Só um usuário com papel "admin" pode criar, editar
 * ou excluir contas — um corretor comum não pode se promover nem mexer nos
 * colegas. Isso é decidido inteiramente no servidor (não dá pra contornar
 * escondendo botões no painel).
 */

const crypto = require('node:crypto');
const { db, hashPassword } = require('../db');
const authService = require('../auth');
const emailService = require('../email');

// Mesma lógica de backend/src/server.js (getBaseUrl) — usada aqui pra montar
// o link de convite que vai dentro do e-mail do novo usuário.
function getBaseUrl(req) {
  const protocolo = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  return `${protocolo}://${req.headers.host}`;
}

function rowToUsuario(row) {
  return {
    id: row.id,
    nome: row.nome,
    email: row.email,
    creci: row.creci,
    papel: row.papel,
    ativo: !!row.ativo,
    createdAt: row.created_at,
  };
}

function contarAdminsAtivos(excluindoId) {
  const { total } = db.prepare(
    `SELECT COUNT(*) AS total FROM users WHERE papel = 'admin' AND ativo = 1 AND id != ?`
  ).get(excluindoId || -1);
  return total;
}

function registerUsuariosRoutes(router) {
  router.get('/api/usuarios', (req, res, params, query, body, user) => {
    if (!user) return res.json(401, { error: 'Autenticação necessária' });
    const rows = db.prepare('SELECT * FROM users ORDER BY nome').all();
    res.json(200, { data: rows.map(rowToUsuario), total: rows.length });
  });

  router.post('/api/usuarios', async (req, res, params, query, body, user) => {
    if (!user) return res.json(401, { error: 'Autenticação necessária' });
    if (user.papel !== 'admin') return res.json(403, { error: 'Só administradores podem cadastrar novos usuários' });

    if (!body.nome || !body.email) {
      return res.json(400, { error: 'Payload inválido', detalhes: ['nome e email são obrigatórios'] });
    }
    // Senha agora é opcional: se o admin não definir uma, mandamos um
    // convite por e-mail pra a própria pessoa escolher a senha dela (mais
    // seguro — a senha nunca fica registrada numa caixa de entrada).
    if (body.senha && String(body.senha).length < 6) {
      return res.json(400, { error: 'Payload inválido', detalhes: ['senha deve ter pelo menos 6 caracteres'] });
    }
    const papel = body.papel === 'admin' ? 'admin' : 'corretor';

    const existente = db.prepare('SELECT id FROM users WHERE email = ?').get(body.email);
    if (existente) return res.json(409, { error: 'Já existe um usuário com esse e-mail' });

    // Sem senha definida pelo admin: gera um hash a partir de bytes
    // aleatórios, impossível de adivinhar ou de ter sido escolhido por
    // alguém — a conta só fica utilizável depois que a pessoa define a
    // própria senha pelo link de convite.
    const { hash, salt } = hashPassword(body.senha || crypto.randomBytes(32).toString('hex'));
    const info = db.prepare(`
      INSERT INTO users (nome, email, creci, senha_hash, senha_salt, papel)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(body.nome, body.email, body.creci || null, hash, salt, papel);

    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);

    let convite = null;
    if (!body.senha) {
      const conviteToken = authService.gerarTokenConvite(info.lastInsertRowid);
      const link = `${getBaseUrl(req)}/admin/definir-senha.html?token=${conviteToken}`;
      const { enviado } = await emailService.enviarConvite({ to: row.email, nome: row.nome, link });
      // O link também volta na resposta (só o admin autenticado que criou o
      // usuário vê isso) — assim dá pra copiar e mandar manualmente se o
      // envio automático falhar ou o e-mail ainda não estiver configurado.
      convite = { link, enviado };
    }

    res.json(201, { data: rowToUsuario(row), convite });
  });

  router.put('/api/usuarios/:id', (req, res, params, query, body, user) => {
    if (!user) return res.json(401, { error: 'Autenticação necessária' });
    if (user.papel !== 'admin') return res.json(403, { error: 'Só administradores podem editar usuários' });

    const id = Number(params.id);
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!existing) return res.json(404, { error: 'Usuário não encontrado' });

    const novoPapel = body.papel !== undefined ? (body.papel === 'admin' ? 'admin' : 'corretor') : existing.papel;
    const novoAtivo = body.ativo !== undefined ? (body.ativo ? 1 : 0) : existing.ativo;

    // Não deixa o painel ficar sem nenhum admin ativo — nem rebaixando o
    // último admin a corretor, nem desativando a conta dele.
    const perdeAdmin = existing.papel === 'admin' && (novoPapel !== 'admin' || !novoAtivo);
    if (perdeAdmin && contarAdminsAtivos(id) === 0) {
      return res.json(400, { error: 'Não é possível remover o último administrador ativo do painel' });
    }

    if (body.email && body.email !== existing.email) {
      const emailEmUso = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(body.email, id);
      if (emailEmUso) return res.json(409, { error: 'Já existe um usuário com esse e-mail' });
    }

    let senhaHash = existing.senha_hash;
    let senhaSalt = existing.senha_salt;
    if (body.senha) {
      if (String(body.senha).length < 6) {
        return res.json(400, { error: 'Payload inválido', detalhes: ['senha deve ter pelo menos 6 caracteres'] });
      }
      const gerado = hashPassword(body.senha);
      senhaHash = gerado.hash;
      senhaSalt = gerado.salt;
    }

    db.prepare(`
      UPDATE users SET nome = ?, email = ?, creci = ?, papel = ?, ativo = ?, senha_hash = ?, senha_salt = ?
      WHERE id = ?
    `).run(
      body.nome ?? existing.nome,
      body.email ?? existing.email,
      body.creci !== undefined ? body.creci : existing.creci,
      novoPapel,
      novoAtivo,
      senhaHash,
      senhaSalt,
      id
    );

    // Desativar um usuário derruba as sessões dele na hora — mesmo raciocínio
    // do requireAuth: acesso é revogado assim que a conta é desativada.
    if (!novoAtivo) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);

    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    res.json(200, { data: rowToUsuario(row) });
  });

  router.delete('/api/usuarios/:id', (req, res, params, query, body, user) => {
    if (!user) return res.json(401, { error: 'Autenticação necessária' });
    if (user.papel !== 'admin') return res.json(403, { error: 'Só administradores podem excluir usuários' });

    const id = Number(params.id);
    if (id === user.id) return res.json(400, { error: 'Você não pode excluir seu próprio usuário' });

    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!existing) return res.json(404, { error: 'Usuário não encontrado' });

    if (existing.papel === 'admin' && existing.ativo && contarAdminsAtivos(id) === 0) {
      return res.json(400, { error: 'Não é possível excluir o último administrador ativo do painel' });
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    res.json(204, null);
  });
}

module.exports = { registerUsuariosRoutes, rowToUsuario };
