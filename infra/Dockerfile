# Portal Malb Imóveis — imagem de produção (Fase 6)
#
# Não há `npm install` porque o backend não tem nenhuma dependência de npm
# (só módulos nativos do Node: http, sqlite, crypto, fs — ver
# backend/README.md). Isso torna a imagem simples: uma cópia do código +
# Node 22, sem etapa de build nem node_modules.
FROM node:22-slim

# node:sqlite exige Node 22.5+; a imagem base já atende isso.
WORKDIR /app

# Copia só o que o servidor precisa em produção (o restante do repo —
# infra/, docs/, .git — fica fora da imagem via .dockerignore).
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# O banco SQLite mora fora da imagem, num volume montado pelo
# docker-compose.yml, para sobreviver a rebuilds/atualizações do container.
ENV DB_PATH=/data/malb.db
RUN mkdir -p /data

# Usuário não-root — princípio de menor privilégio dentro do container.
RUN groupadd -r malb && useradd -r -g malb malb \
  && chown -R malb:malb /app /data
USER malb

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

WORKDIR /app/backend
CMD ["node", "src/server.js"]
