FROM python:3.6-slim

MAINTAINER Schemen <me@schemen.me>

EXPOSE 8000

WORKDIR /usr/src/app

VOLUME /usr/src/app/data
VOLUME /usr/src/app/static/assets

ENTRYPOINT ["/usr/bin/dumb-init", "--"]

COPY requirements.txt ./
RUN apt-get update && apt-get install dumb-init && \
    pip install --no-cache-dir -r requirements.txt

COPY PlanarAlly/ .
COPY Dockerfiles/docker-entrypoint.sh /
COPY Dockerfiles/server_config.cfg server_config.cfg

CMD [ "python", "-u", "planarserver.py"]
