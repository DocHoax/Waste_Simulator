FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY server-auth.js ./
COPY db.js ./
COPY .env.example ./

EXPOSE 5051

CMD ["npm", "start"]
