##
## digiserve/ab-definition-manager:develop
##
## This is our microservice for our AppBuilder Definitions.
##
## Docker Commands:
## ---------------
## $ docker build -t digiserve/ab-definition-manager:develop .
## $ docker push digiserve/ab-definition-manager:develop
##

FROM digiserve/service-cli:develop

RUN git clone --recursive https://github.com/digi-serve/ab_service_definition_manager.git app && cd app && git checkout develop && git submodule update --recursive && npm install

WORKDIR /app

CMD [ "node", "--inspect=0.0.0.0:9229", "app.js" ]
