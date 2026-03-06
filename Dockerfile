FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --production=false

COPY tsconfig.json ./
COPY src/ ./src/

EXPOSE 3001

CMD ["npx", "tsx", "src/main.ts"]
