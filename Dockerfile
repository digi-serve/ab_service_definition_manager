##
## digiserve/ab-definition-manager
##
## This is our microservice for our AppBuilder Definitions.
##
## Docker Commands:
## ---------------
## $ docker build -t digiserve/ab-definition-manager:master .
## $ docker push digiserve/ab-definition-manager:master
##

ARG BRANCH=master

FROM digiserve/service-cli:${BRANCH}

COPY . /app

WORKDIR /app

RUN npm i -f

WORKDIR /app/AppBuilder

RUN npm i -f

WORKDIR /app

CMD [ "node", "--inspect=0.0.0.0:9229", "app.js" ]
