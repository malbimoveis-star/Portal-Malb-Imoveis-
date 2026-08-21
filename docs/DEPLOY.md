# Publicação em produção — Portal Malb Imóveis

Guia passo a passo para colocar o portal no ar. Cobre o que dá para preparar de antemão (código, configuração, scripts) e é explícito sobre as poucas partes que só você pode fazer — comprar um domínio, contratar hospedagem e digitar as próprias credenciais de pagamento não são coisas que uma sessão de automação deveria fazer por você.

## 1. Decisões que faltam tomar

Antes de publicar, três coisas do roadmap (`ROADMAP.md`, seção "Decisões pendentes") precisam de uma resposta sua:

1. **Domínio** — qual será (ex: `malbimoveis.com.br`)? Se ainda não tem um registrado, qualquer registrador (registro.br para `.com.br`, ou Namecheap/GoDaddy/Cloudflare para outros) resolve.
2. **Hospedagem** — um VPS Linux comum atende bem esta stack (ela é um único processo Node + SQLite, não precisa de infraestrutura elaborada). Opções usadas no mercado: DigitalOcean, Hetzner, AWS Lightsail, Vultr — todas cobram por hora/mês, a partir de valores baixos (o app é leve). Se preferir algo gerenciado sem lidar com servidor Linux, Railway ou Render também rodam um Dockerfile diretamente.
3. **Confirmar a stack** — esta Fase 6 preparou a stack **atual** (Node puro + SQLite) para produção, e não a migração para NestJS/Prisma/PostgreSQL/Next.js proposta no roadmap original, porque o ambiente onde o projeto foi construído não tem acesso ao npm para instalar/testar essas ferramentas (ver `../infra/README.md`). A stack atual já passou por testes de ponta a ponta em todas as fases — é uma base sólida para ir ao ar; a migração de framework fica para uma etapa futura, quando houver um ambiente de desenvolvimento com npm.

## 2. Provisionar o servidor

Com um VPS novo (Ubuntu 22.04 ou mais recente é a recomendação mais comum):

```bash
# No servidor, como root ou com sudo:
apt update && apt upgrade -y
apt install -y docker.io docker-compose-plugin
```

Aponte o DNS do domínio para o IP do servidor **antes** de seguir adiante — o Caddy (passo 4) só consegue emitir o certificado HTTPS depois que o domínio resolve para lá:

| Tipo | Nome | Valor |
|---|---|---|
| A | `@` (ou `malbimoveis.com.br`) | IP do servidor |
| A | `www` | IP do servidor |

A propagação do DNS pode levar de alguns minutos a algumas horas.

## 3. Trazer o código para o servidor

```bash
git clone https://github.com/malbimoveis-star/Portal-Malb-Imoveis-.git /opt/portal-malb-imoveis
cd /opt/portal-malb-imoveis
```

## 4. Configurar e subir (caminho recomendado: Docker)

```bash
cp backend/.env.example infra/.env
nano infra/.env   # ajuste ALLOWED_ORIGIN e adicione SITE_DOMAIN=malbimoveis.com.br
```

No `infra/.env`, além das variáveis de `backend/.env.example`, adicione:

```
SITE_DOMAIN=malbimoveis.com.br
```

Suba a stack:

```bash
docker compose -f infra/docker-compose.yml --env-file infra/.env up -d --build
```

Isso builda a imagem do app, sobe o app e o Caddy na frente. O Caddy detecta o domínio configurado e emite o certificado HTTPS automaticamente na primeira requisição — não precisa rodar `certbot` nem renovar nada manualmente depois.

Confirme que está no ar:

```bash
curl -I https://malbimoveis.com.br/api/health
docker compose -f infra/docker-compose.yml logs -f app
```

## 4b. Alternativa sem Docker (systemd + Caddy no host)

Se preferir não usar Docker:

```bash
# Instale o Node 22+ (ex: via NodeSource) e crie um usuário de sistema:
useradd -r -m -d /opt/portal-malb-imoveis malb
git clone https://github.com/malbimoveis-star/Portal-Malb-Imoveis-.git /opt/portal-malb-imoveis
chown -R malb:malb /opt/portal-malb-imoveis

cp /opt/portal-malb-imoveis/backend/.env.example /opt/portal-malb-imoveis/backend/.env
nano /opt/portal-malb-imoveis/backend/.env   # ajuste ALLOWED_ORIGIN, NODE_ENV=production

cp /opt/portal-malb-imoveis/infra/portal-malb.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now portal-malb

# Caddy instalado direto no host, como reverse proxy com HTTPS automático:
apt install -y caddy
caddy reverse-proxy --from malbimoveis.com.br --to localhost:3001 &
# (para algo permanente, configure um /etc/caddy/Caddyfile com o mesmo
# conteúdo de infra/Caddyfile e `systemctl enable --now caddy`)
```

## 5. Dados iniciais

O servidor sobe com os 12 imóveis de exemplo e o usuário demo (`admin@malbimoveis.com` / `malb2026`). Antes de divulgar o site publicamente:

1. Entre no painel (`https://malbimoveis.com.br/admin/login.html`), troque a senha do usuário demo e cadastre os corretores de verdade na aba Equipe.
2. Substitua os imóveis de exemplo pelos imóveis reais (pela aba Imóveis do painel, um a um, ou em lote pela API de parceiros — `docs/API.md` — se você já tiver os dados num CRM ou planilha exportável).

## 6. Backups

O banco SQLite vive no volume Docker `malb_data` (ou em `backend/data/malb.db`, no caminho sem Docker). Agende o backup diário:

```bash
# Com Docker — roda o script dentro do container do app:
0 3 * * * docker compose -f /opt/portal-malb-imoveis/infra/docker-compose.yml exec -T app node scripts/backup-db.js >> /var/log/malb-backup.log 2>&1

# Sem Docker:
0 3 * * * cd /opt/portal-malb-imoveis/backend && sudo -u malb node scripts/backup-db.js >> /var/log/malb-backup.log 2>&1
```

Os backups ficam em `backend/data/backups/` (14 mais recentes, por padrão — ajustável via `BACKUP_RETENTION`). Vale copiar esses arquivos periodicamente para fora do próprio servidor (ex: um bucket S3-compatível, ou baixar manualmente) — um backup que mora só no mesmo disco do banco não protege contra a perda do servidor inteiro.

## 7. Monitoramento básico

`GET /api/health` responde `{"status":"ok"}` sem autenticação — é o endpoint pensado para checagem externa (UptimeRobot, Better Uptime, ou um `cron` simples com `curl` + alerta por e-mail). O `HEALTHCHECK` já embutido no `Dockerfile` faz o Docker reiniciar o container sozinho se o processo travar.

## 8. Atualizar para uma versão nova do código

```bash
cd /opt/portal-malb-imoveis
git pull
# Docker:
docker compose -f infra/docker-compose.yml --env-file infra/.env up -d --build
# systemd:
systemctl restart portal-malb
```

O desligamento é gracioso (o servidor termina as requisições em andamento antes de encerrar — ver `backend/src/server.js`), então uma atualização não deve cortar uma requisição no meio.

## 9. Rollback

```bash
cd /opt/portal-malb-imoveis
git log --oneline -10        # ache o commit anterior estável
git checkout <hash-do-commit>
docker compose -f infra/docker-compose.yml --env-file infra/.env up -d --build
```

Se o problema for nos dados (não no código), restaure o backup mais recente antes do incidente:

```bash
docker compose -f infra/docker-compose.yml stop app
cp backend/data/backups/malb-<data-do-backup>.db backend/data/malb.db   # ou o caminho do volume, se estiver em Docker
docker compose -f infra/docker-compose.yml start app
```
