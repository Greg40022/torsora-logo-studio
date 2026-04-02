FROM node:20-alpine

WORKDIR /app

# Copy dependency manifests first (layer cache optimization)
COPY package.json ./

# Install production dependencies only
RUN npm install --omit=dev

# Copy application source
COPY server.js ./
COPY public/ ./public/

# Pre-create data dir (will be overridden by volume mount at runtime)
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "server.js"]
