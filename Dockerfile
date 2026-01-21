FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install --production

COPY . .

# Ensure data directory exists (though volume will likely mount over it)
RUN mkdir -p data

VOLUME ["/usr/src/app/data"]

CMD ["npm", "start"]
