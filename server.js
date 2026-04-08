#!/usr/bin/env node
"use strict";
// SingleFile WEBService - HTTP wrapper for single-file-cli

const http = require("http");
const { spawn } = require("child_process");
const { URL } = require("url");
const querystring = require("querystring");

const PORT = parseInt(process.env.PORT || "8080", 10);
const TIMEOUT = parseInt(process.env.TIMEOUT || "60", 10) * 1000;
const BROWSER_EXECUTABLE_PATH =
  process.env.BROWSER_EXECUTABLE_PATH || "/usr/bin/chromium-browser";
const BROWSER_ARGS = process.env.BROWSER_ARGS || '["--no-sandbox"]';

function validateUrl(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function respond(res, code, contentType, body) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(code, {
    "Content-Type": contentType,
    "Content-Length": buf.length,
  });
  res.end(buf);
}

function fetch(url, res) {
  if (!validateUrl(url)) {
    respond(res, 400, "text/plain", "Invalid or unsupported URL");
    return;
  }

  const chunks = [];
  const errChunks = [];
  let done = false;

  function finish(code, contentType, body) {
    if (done) return;
    done = true;
    clearTimeout(timer);
    respond(res, code, contentType, body);
  }

  const child = spawn("single-file", [
    `--browser-executable-path=${BROWSER_EXECUTABLE_PATH}`,
    `--browser-args=${BROWSER_ARGS}`,
    url,
    "--dump-content",
  ]);

  const timer = setTimeout(() => {
    child.kill();
    finish(504, "text/plain", "Request timed out");
  }, TIMEOUT);

  child.stdout.on("data", (d) => chunks.push(d));
  child.stderr.on("data", (d) => errChunks.push(d));

  child.on("close", (code) => {
    if (done) return;
    if (code === 0) {
      finish(200, "text/html; charset=utf-8", Buffer.concat(chunks));
    } else {
      const errBuf =
        errChunks.length > 0
          ? Buffer.concat(errChunks)
          : chunks.length > 0
          ? Buffer.concat(chunks)
          : Buffer.from("Unknown error");
      finish(500, "text/plain", errBuf);
    }
  });

  child.on("error", (err) => {
    finish(500, "text/plain", err.message);
  });
}

const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);

  if (reqUrl.pathname === "/health") {
    respond(res, 200, "text/plain", "OK");
    return;
  }

  if (req.method === "GET") {
    const url = reqUrl.searchParams.get("url");
    if (!url) {
      respond(res, 400, "text/plain", "Missing url parameter");
      return;
    }
    fetch(url, res);
    return;
  }

  if (req.method === "POST") {
    const bodyChunks = [];
    req.on("data", (d) => bodyChunks.push(d));
    req.on("end", () => {
      const body = Buffer.concat(bodyChunks).toString("utf-8");
      const params = querystring.parse(body);
      const url = Array.isArray(params.url) ? params.url[0] : params.url;
      if (!url) {
        respond(res, 400, "text/plain", "Missing url parameter");
        return;
      }
      fetch(url, res);
    });
    return;
  }

  respond(res, 405, "text/plain", "Method Not Allowed");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`SingleFile WEBService listening on port ${PORT}`);
});
