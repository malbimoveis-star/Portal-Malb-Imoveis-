'use strict';

/**
 * Disparo de webhooks para parceiros (Fase 4).
 *
 * Quando um lead chega para um imóvel importado por um parceiro, ou quando o
 * corretor muda o status de um imóvel de um parceiro pelo painel, avisamos o
 * `webhook_url` cadastrado por esse parceiro — assim o CRM dele fica em dia
 * sem precisar ficar consultando a API o tempo todo.
 *
 * O corpo é assinado com HMAC-SHA256 (header `X-Malb-Signature`) usando o
 * `webhook_secret` do parceiro, para o receptor confirmar que o envio veio
 * mesmo da Malb — o mesmo padrão usado por GitHub/Stripe.
 *
 * Limitação conhecida (documentada no roadmap): é uma única tentativa com
 * timeout curto, sem fila de reentrega. Para produção, isso deveria virar
 * uma fila com retry exponencial.
 */

const http = require('node:http');
const https = require('node:https');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const { db } = require('./db');

const TIMEOUT_MS = 5000;

function assinar(secret, corpo) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(corpo).digest('hex');
}

function registrarEntrega(parceiroId, evento, sucesso, statusHttp, erro) {
  try {
    db.prepare(`
      INSERT INTO webhook_entregas (parceiro_id, evento, sucesso, status_http, erro)
      VALUES (?, ?, ?, ?, ?)
    `).run(parceiroId, evento, sucesso ? 1 : 0, statusHttp || null, erro || null);
  } catch (e) {
    console.error('[webhook] falha ao registrar entrega:', e.message);
  }
}

/** Dispara um webhook para um parceiro. Não lança — falhas só ficam logadas. */
function dispararWebhook(parceiro, evento, dados) {
  if (!parceiro || !parceiro.webhook_url) return;

  let url;
  try {
    url = new URL(parceiro.webhook_url);
  } catch {
    registrarEntrega(parceiro.id, evento, false, null, 'webhook_url inválida');
    return;
  }

  const corpo = JSON.stringify({ evento, dados, enviadoEm: new Date().toISOString() });
  const assinatura = assinar(parceiro.webhook_secret, corpo);
  const lib = url.protocol === 'https:' ? https : http;

  const req = lib.request(
    url,
    {
      method: 'POST',
      timeout: TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(corpo),
        'X-Malb-Signature': assinatura,
        'X-Malb-Evento': evento,
        'User-Agent': 'PortalMalbImoveis-Webhooks/1.0',
      },
    },
    (res) => {
      res.resume(); // descarta o corpo da resposta, só nos importa o status
      const sucesso = res.statusCode >= 200 && res.statusCode < 300;
      registrarEntrega(parceiro.id, evento, sucesso, res.statusCode, sucesso ? null : `HTTP ${res.statusCode}`);
    }
  );
  req.on('timeout', () => {
    req.destroy(new Error('timeout'));
  });
  req.on('error', (err) => {
    registrarEntrega(parceiro.id, evento, false, null, err.message);
  });
  req.write(corpo);
  req.end();
}

module.exports = { dispararWebhook, assinar };
