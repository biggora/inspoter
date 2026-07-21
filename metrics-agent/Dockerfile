FROM python:3.12-slim

RUN groupadd -r agent && useradd -r -g agent -s /sbin/nologin agent

WORKDIR /app
COPY collector.py .

USER agent

ENTRYPOINT ["python", "-u", "collector.py"]
