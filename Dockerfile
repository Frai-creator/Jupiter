FROM node:20-alpine

# Fonts for the /rank image card (@napi-rs/canvas draws text with system fonts)
RUN apk add --no-cache fontconfig ttf-dejavu

WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
