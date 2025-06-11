# Build stage
FROM node:20.15.0-alpine AS development

WORKDIR /app

COPY ["package.json", "yarn.lock", "./"]
RUN yarn install

COPY . .
CMD ["npm", "run", "start:api"]
EXPOSE 9230
