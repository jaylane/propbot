FROM node:20-alpine

WORKDIR /app

# Install build deps for better-sqlite3
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --only=production

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm install typescript ts-node @types/node @types/better-sqlite3 --save-dev && \
    npm run build && \
    rm -rf src/ node_modules/ && \
    npm ci --only=production

RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/propbot.db

CMD ["node", "dist/index.js"]
