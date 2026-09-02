FROM node:24-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV ACCOUNT_CLOSURE_LEDGER_DIRECTORY=/ledger-data/tombstones

COPY ops/closure-ledger ./ops/closure-ledger

RUN mkdir -p /ledger-data/tombstones \
  && chown -R node:node /app /ledger-data

USER node
EXPOSE 3000

CMD ["node", "ops/closure-ledger/server.mjs"]
