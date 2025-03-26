FROM node:lts-alpine

RUN apk add --no-cache musl musl-utils musl-locales tzdata
EXPOSE 3000
USER node
WORKDIR /app
COPY --chown=node package.json package-lock.json .

RUN npm i

COPY --chown=node . . 

CMD node app.js
