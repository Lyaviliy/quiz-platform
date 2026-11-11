FROM node:22-slim AS build
WORKDIR /app
COPY client/package*.json client/
RUN npm ci --prefix client
COPY client client
RUN npm run build --prefix client

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY server server
COPY --from=build /app/client/dist client/dist
# База SQLite лежит в /app/data — подключите сюда постоянный том, иначе данные пропадут при пересоздании контейнера.
VOLUME /app/data
EXPOSE 3000
CMD ["node", "server/index.js"]
