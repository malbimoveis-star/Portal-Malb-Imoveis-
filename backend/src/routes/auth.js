'use strict';

const authService = require('../auth');

function registerAuthRoutes(router) {
  router.post('/api/auth/login', (req, res, params, query, body) => {
    if (!body.email || !body.senha) {
      return res.json(400, { error: 'email e senha são obrigatórios' });
    }
    const result = authService.login(body.email, body.senha);
    if (!result) return res.json(401, { error: 'Credenciais inválidas' });
    res.json(200, { data: result });
  });

  router.post('/api/auth/logout', (req, res, params, query, body, user, token) => {
    if (token) authService.logout(token);
    res.json(204, null);
  });

  router.get('/api/auth/me', (req, res, params, query, body, user) => {
    if (!user) return res.json(401, { error: 'Autenticação necessária' });
    res.json(200, { data: user });
  });
}

module.exports = { registerAuthRoutes };
