# Infra — Portal Malb Imóveis

Configuração de deploy, ambiente e publicação em produção.

**Status: Fase 6 (parte de hardening/infraestrutura) concluída e testada.** A escolha de domínio e provedor de hospedagem continua pendente de decisão sua (ver `../docs/ROADMAP.md`, seção "Decisões pendentes") — o que está pronto aqui funciona com qualquer VPS Linux comum (DigitalOcean, Hetzner, AWS Lightsail etc), sem exigir um provedor específico.

## O que tem aqui

- **`Dockerfile`** — empacota o backend (que serve a API e o site público, ver `../backend/README.md`) numa imagem Node 22, sem etapa de `npm install` (o projeto não tem dependências de npm).
- **`docker-compose.yml`** + **`Caddyfile`** — sobe o app junto com um proxy reverso [Caddy](https://caddyserver.com/), que emite e renova o certificado HTTPS automaticamente (Let's Encrypt) assim que o domínio estiver apontando para o servidor. Caminho recomendado para quem vai usar Docker.
- **`portal-malb.service`** — unidade `systemd` para quem prefere rodar sem Docker, direto num VPS.
- **`../backend/.env.example`** — variáveis de ambiente de produção (domínio permitido no CORS, rate limiting, caminho do banco). Documentado ali mesmo, com defaults seguros para quem não configurar nada.
- **`../backend/scripts/backup-db.js`** — backup do SQLite (`VACUUM INTO`, sem depender de nenhum pacote externo), pensado para rodar via cron.

## Como publicar de fato

Passo a passo completo (provisionar servidor, DNS, primeiro deploy, backups, rollback) em **[`../docs/DEPLOY.md`](../docs/DEPLOY.md)**.

## Sobre a stack proposta (NestJS/Prisma/PostgreSQL/Next.js)

O roadmap original propõe migrar para essa stack na Fase 6. Isso **não foi feito** nesta sessão: o ambiente onde o projeto foi construído bloqueia o acesso ao registro do npm (erro 403 em qualquer `npm install`), então não é possível instalar, rodar nem testar um projeto NestJS/Prisma/Next.js aqui — e entregar código nesse volume sem poder testá-lo de verdade contradiz o cuidado que o resto do projeto teve até agora. Em vez disso, esta Fase 6 deixou a stack atual (Node puro + SQLite, já testada em todas as fases anteriores) pronta para produção de verdade. O modelo de dados e os contratos de API (`../docs/API.md`) continuam desenhados para que a migração de stack, quando houver um ambiente com acesso normal ao npm (sua máquina, por exemplo), seja uma troca de camada — não uma reescrita.
