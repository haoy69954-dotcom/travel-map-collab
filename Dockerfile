FROM node:22-alpine

WORKDIR /app
COPY package.json server.js ./
COPY public ./public

RUN mkdir -p /app/data && chown -R node:node /app
USER node

ENV HOST=0.0.0.0
ENV PORT=4173
ENV DATA_DIR=/app/data
EXPOSE 4173
VOLUME ["/app/data"]

CMD ["node", "server.js"]
