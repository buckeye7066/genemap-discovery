# Restore-independent account-deletion ledger.
#
# Deliberately dependency-free: the whole service is one Node file using only
# node: builtins, so there is no lockfile, no install step, and no third-party
# code in the path of a deletion receipt.
FROM node:24-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    LEDGER_DATA_DIR=/data

COPY server.mjs ./server.mjs

# The ledger runs as root so it can write to the platform-provisioned volume,
# which is mounted root-owned (the sibling Redis service in this project has
# the same constraint). The container has no package manager surface, no
# dependencies, and a single bound port.
EXPOSE 8080

CMD ["node", "/app/server.mjs"]
