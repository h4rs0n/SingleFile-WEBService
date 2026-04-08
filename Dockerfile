FROM zenika/alpine-chrome:with-node

USER root

WORKDIR /usr/src/app

RUN npm install --omit=dev single-file-cli \
    && apk add --no-cache python3

COPY server.py .

ENV PATH="/usr/src/app/node_modules/.bin:${PATH}"
ENV PORT=8080
ENV TIMEOUT=60
ENV BROWSER_EXECUTABLE_PATH=/usr/bin/chromium-browser

EXPOSE 8080

CMD ["python3", "server.py"]
