FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY server.js ./
COPY .env.example ./

EXPOSE 5000

CMD ["npm", "start"]
