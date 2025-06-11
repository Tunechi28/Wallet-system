# Build stage
FROM node:20.15.0-alpine AS development

WORKDIR /app

COPY package*.json ./
COPY yarn.lock* ./
RUN npm ci --force

COPY . .

# Accept an argument to specify the service to build
ARG SERVICE
RUN npx nx build $SERVICE

# Production stage
FROM node:18-alpine

WORKDIR /app

COPY --from=builder /app ./app
WORKDIR /app

# Accept an argument to specify the service to run
ARG SERVICE
ENV NODE_ENV production
EXPOSE 9230 9231

CMD ["npm run start:$SERVICE"]
