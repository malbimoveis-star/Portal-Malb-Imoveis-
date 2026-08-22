'use strict';

/**
 * Cliente SMTP mínimo, sem dependências de npm — fala o protocolo SMTP "na
 * mão" sobre uma conexão TLS (SMTPS implícito, porta 465, que é o que o
 * Gmail aceita direto sem precisar de STARTTLS). Cobre só o necessário para
 * este projeto: e-mails transacionais simples (convite de acesso,
 * redefinição de senha, aviso de login), um destinatário por vez.
 *
 * Se SMTP_HOST/SMTP_USER/SMTP_PASS não estiverem configurados (nenhum
 * `.env`, como em desenvolvimento local), os e-mails não são enviados de
 * verdade — só ficam registrados no console, o que já é suficiente para
 * testar os fluxos de convite/redefinição sem precisar de credenciais reais.
 */

const tls = require('node:tls');
const { config } = require('./config');

function lerResposta(socket) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const onData = (chunk) => {
      buffer += chunk.toString('utf8');
      const linhas = buffer.split('\r\n').filter((l) => l.length > 0);
      const ultima = linhas[linhas.length - 1];
      // Numa resposta SMTP multi-linha, só a última linha tem um espaço
      // depois do código de 3 dígitos ("250 OK"); as intermediárias têm um
      // hífen ("250-EXTENSÃO"). Só damos a resposta por completa aí.
      if (ultima && /^\d{3} /.test(ultima)) {
        cleanup();
        resolve({ codigo: parseInt(ultima.slice(0, 3), 10), texto: buffer });
      }
    };
    const onError = (err) => { cleanup(); reject(err); };
    function cleanup() {
      socket.removeListener('data', onData);
      socket.removeListener('error', onError);
    }
    socket.on('data', onData);
    socket.on('error', onError);
  });
}

async function comando(socket, texto) {
  const resposta = lerResposta(socket);
  if (texto !== null) socket.write(texto + '\r\n');
  const r = await resposta;
  if (r.codigo >= 400) {
    throw new Error(`SMTP recusou "${texto === null ? '(conexão)' : texto.split(' ')[0]}": ${r.texto.trim()}`);
  }
  return r;
}

function escaparCabecalho(valor) {
  return String(valor).replace(/[\r\n]/g, ' ');
}

function montarMensagem({ from, to, subject, html, text }) {
  const boundary = `malb-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const linhas = [
    `From: Portal Malb Imóveis <${from}>`,
    `To: <${to}>`,
    `Subject: ${escaparCabecalho(subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    ``,
    text,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    ``,
    html,
    ``,
    `--${boundary}--`,
    `.`,
  ];
  // "Dot-stuffing" exigido pelo protocolo SMTP: uma linha do corpo que
  // comece com "." precisa virar ".." pra não ser confundida com o
  // terminador de DATA.
  return linhas.map((l) => (l.startsWith('.') ? '.' + l : l)).join('\r\n');
}

async function enviarEmailBruto({ to, from, subject, html, text }) {
  const { host, port, user, pass } = config.smtp;
  const socket = tls.connect({ host, port, servername: host });
  socket.setEncoding('utf8');
  socket.setTimeout(15000, () => socket.destroy(new Error('Tempo esgotado ao conectar no servidor SMTP')));

  try {
    await comando(socket, null); // saudação inicial do servidor (220)
    await comando(socket, `EHLO portalmalbimoveis.local`);
    await comando(socket, `AUTH LOGIN`);
    await comando(socket, Buffer.from(user, 'utf8').toString('base64'));
    await comando(socket, Buffer.from(pass, 'utf8').toString('base64'));
    await comando(socket, `MAIL FROM:<${from}>`);
    await comando(socket, `RCPT TO:<${to}>`);
    await comando(socket, `DATA`);
    await comando(socket, montarMensagem({ from, to, subject, html, text }));
    await comando(socket, `QUIT`);
  } finally {
    socket.end();
  }
}

/**
 * Envia um e-mail. Retorna { enviado: true|false } — nunca lança erro, pra
 * que uma falha de e-mail (SMTP fora do ar, credencial errada) nunca quebre
 * a ação principal (criar usuário, fazer login, pedir redefinição de senha).
 */
async function enviarEmail({ to, subject, html, text }) {
  const { host, user, pass, from } = config.smtp;
  if (!host || !user || !pass) {
    console.log(`[email] SMTP não configurado — e-mail NÃO enviado de verdade.\n  Para: ${to}\n  Assunto: ${subject}\n  ${text.replace(/\n/g, '\n  ')}`);
    return { enviado: false, motivo: 'smtp_nao_configurado' };
  }
  try {
    await enviarEmailBruto({ to, from: from || user, subject, html, text });
    return { enviado: true };
  } catch (err) {
    const detalhe = String(err && (err.message || err.code || err)).replace(/\s+/g, ' ').trim();
    console.error(`[email] Falha ao enviar e-mail para ${to} | erro: ${detalhe || '(sem mensagem)'} | code=${err && err.code}`);
    return { enviado: false, motivo: detalhe };
  }
}

function envolverEmHtml(tituloInterno, corpoHtml) {
  return `<!DOCTYPE html>
<html lang="pt-BR"><body style="margin:0;padding:24px;background:#F7F8F7;font-family:Arial,Helvetica,sans-serif;color:#1C2B22;">
  <div style="max-width:480px;margin:0 auto;background:#FFFFFF;border-radius:12px;padding:32px;">
    <p style="font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#2E9E4E;font-weight:bold;margin:0 0 8px;">Portal Malb Imóveis</p>
    <h1 style="font-size:20px;margin:0 0 16px;color:#21519A;">${tituloInterno}</h1>
    ${corpoHtml}
    <p style="margin-top:32px;font-size:12px;color:#6B7A70;">Se você não esperava este e-mail, pode ignorá-lo com segurança.</p>
  </div>
</body></html>`;
}

function botaoHtml(link, texto) {
  return `<p style="text-align:center;margin:24px 0;">
    <a href="${link}" style="background:#21519A;color:#FFFFFF;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold;display:inline-block;">${texto}</a>
  </p>
  <p style="font-size:12px;color:#6B7A70;word-break:break-all;">Ou copie e cole este link no navegador:<br>${link}</p>`;
}

function enviarConvite({ to, nome, link }) {
  const subject = 'Seu acesso ao Portal Malb Imóveis';
  const text = `Olá, ${nome}!\n\nVocê foi cadastrado(a) no painel do Portal Malb Imóveis. Para acessar, defina sua senha neste link (válido por 3 dias):\n${link}\n\nSe você não esperava este e-mail, ignore-o.`;
  const html = envolverEmHtml('Você foi convidado(a) para o painel', `
    <p>Olá, ${escaparCabecalho(nome)}!</p>
    <p>Você foi cadastrado(a) no painel do Portal Malb Imóveis. Para acessar, defina sua senha clicando no botão abaixo (o link vale por 3 dias):</p>
    ${botaoHtml(link, 'Definir minha senha')}
  `);
  return enviarEmail({ to, subject, html, text });
}

function enviarRedefinicaoSenha({ to, nome, link }) {
  const subject = 'Redefinição de senha — Portal Malb Imóveis';
  const text = `Olá, ${nome}!\n\nRecebemos um pedido para redefinir sua senha no Portal Malb Imóveis. Se foi você, defina uma nova senha neste link (válido por 1 hora):\n${link}\n\nSe não foi você, ignore este e-mail — sua senha continua a mesma.`;
  const html = envolverEmHtml('Redefinir sua senha', `
    <p>Olá, ${escaparCabecalho(nome)}!</p>
    <p>Recebemos um pedido para redefinir sua senha no Portal Malb Imóveis. Se foi você, clique no botão abaixo (o link vale por 1 hora):</p>
    ${botaoHtml(link, 'Redefinir minha senha')}
    <p>Se não foi você quem pediu, ignore este e-mail — sua senha continua a mesma.</p>
  `);
  return enviarEmail({ to, subject, html, text });
}

function enviarNotificacaoLogin({ to, nome, dataHora }) {
  const subject = 'Novo login no seu painel — Portal Malb Imóveis';
  const text = `Olá, ${nome}!\n\nDetectamos um login no seu painel do Portal Malb Imóveis em ${dataHora}.\n\nSe foi você, pode ignorar este e-mail. Se não reconhece esse acesso, redefina sua senha imediatamente.`;
  const html = envolverEmHtml('Novo login detectado', `
    <p>Olá, ${escaparCabecalho(nome)}!</p>
    <p>Detectamos um login no seu painel em <strong>${escaparCabecalho(dataHora)}</strong>.</p>
    <p>Se foi você, pode ignorar este e-mail. Se não reconhece esse acesso, recomendamos redefinir sua senha imediatamente pela tela de login ("Esqueci minha senha").</p>
  `);
  return enviarEmail({ to, subject, html, text });
}

module.exports = { enviarEmail, enviarConvite, enviarRedefinicaoSenha, enviarNotificacaoLogin };
