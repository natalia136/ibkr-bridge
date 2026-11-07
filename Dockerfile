FROM node:22-slim

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

COPY lib ./lib
COPY server.js ./

EXPOSE 8080
CMD ["node", "server.js"]
