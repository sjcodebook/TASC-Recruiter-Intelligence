FROM node:24-alpine AS build
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/server/dist ./dist
COPY --from=build /app/server/src/infrastructure/database/migrations ./dist/src/infrastructure/database/migrations
COPY data /app/data
EXPOSE 4000
CMD ["npm", "run", "start:railway"]
