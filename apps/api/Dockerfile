FROM node:20-alpine
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @c16/core build && pnpm --filter api build
WORKDIR /repo/apps/api
EXPOSE 4000
CMD ["pnpm", "start"]
