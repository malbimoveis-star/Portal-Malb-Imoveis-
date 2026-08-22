'use strict';

const authService = require('../auth');
const emailService = require('../email');

// Mesma lógica de backend/src/server.js (getBaseUrl) — usada aqui pra montar
// os links de convite/redefinição de senha que vão dentro dos e-mails.
function getBaseUrl(req) {
  const protocolo = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  return `${protocolo}://${req.headers.host}`;
}

function registerAuthRoutes(router) {
  router.post('/api/auth/login', (req, res, params, query, body) => {
    if (!body.email || !body.senha) {
      return res.json(400, { error: 'email e senha são obrigatórios' });
    }
    const result = authService.login(body.email, body.senha);
    if (!result) return res.json(401, { error: 'Credenciais inválidas' });
    res.json(200, { data: result });

    // Aviso de login por e-mail: dispara em segundo plano, sem atrasar nem
    // arriscar o login em si — se o envio falhar (SMTP fora do ar, sem
    // credencial configurada), não tem efeito nenhum sobre a resposta acima.
    emailService
      .enviarNotificacaoLogin({
        to: result.user.email,
        nome: result.user.nome,
        dataHora: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
      })
      .catch(() => {});
  });

  router.post('/api/auth/logout', (req, res, params, query, body, user, token) => {
    if (token) authService.logout(token);
    res.json(204, null);
  });

  router.get('/api/auth/me', (req, res, params, query, body, user) => {
    if (!user) return res.json(401, { error: 'Autenticação necessária' });
    res.json(200, { data: user });
  });

  // "Esqueci minha senha" — a resposta é sempre a mesma, exista ou não
  // cadastro com esse e-mail, pra não dar pista a quem está tentando
  // descobrir quais e-mails têm conta no sistema.
  router.post('/api/auth/esqueci-senha', (req, res, params, query, body) => {
    if (!body.email) return res.json(400, { error: 'e-mail é obrigatório' });

    const resultado = authService.gerarTokenRedefinicao(body.email);
    if (resultado) {
      const link = `${getBaseUrl(req)}/admin/definir-senha.html?token=${resultado.token}`;
      emailService
        .enviarRedefinicaoSenha({ to: resultado.user.email, nome: resultado.user.nome, link })
        .catch(() => {});
    }
    res.json(200, {
      data: { mensagem: 'Se esse e-mail estiver cadastrado, enviamos um link para redefinir a senha.' },
    });
  });

  // Usada pela tela de "definir senha" (convite ou redefinição) pra checar,
  // antes de mostrar o formulário, se o link ainda é válido — e pra
  // personalizar a mensagem com o nome da pessoa.
  router.get('/api/auth/token/:token', (req, res, params) => {
    const info = authService.consultarToken(params.token);
    if (!info) return res.json(404, { error: 'Link inválido ou expirado' });
    res.json(200, { data: { tipo: info.tipo, nome: info.user.nome, email: info.user.email } });
  });

  router.post('/api/auth/definir-senha', (req, res, params, query, body) => {
    if (!body.token || !body.senha) return res.json(400, { error: 'token e senha são obrigatórios' });
    if (String(body.senha).length < 6) {
      return res.json(400, { error: 'Payload inválido', detalhes: ['senha deve ter pelo menos 6 caracteres'] });
    }
    const ok = authService.definirSenhaComToken(body.token, body.senha);
    if (!ok) return res.json(400, { error: 'Link inválido ou expirado' });
    res.json(200, { data: { ok: true } });
  });
}

module.exports = { registerAuthRoutes };
