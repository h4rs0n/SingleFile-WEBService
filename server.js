#!/usr/bin/env node
"use strict";
// SingleFile WEBService - async task wrapper for single-file-cli

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");
const { URL } = require("url");
const querystring = require("querystring");

const PORT = parseInt(process.env.PORT || "8080", 10);
const TIMEOUT = parseInt(process.env.TIMEOUT || "60", 10) * 1000;
const BROWSER_EXECUTABLE_PATH =
  process.env.BROWSER_EXECUTABLE_PATH || "/usr/bin/chromium-browser";
const BROWSER_ARGS = process.env.BROWSER_ARGS || '["--no-sandbox"]';
const OUTPUT_DIR = process.env.OUTPUT_DIR || process.cwd();

const TASK_ENDPOINTS = new Set(["/", "/task", "/task/create"]);
const tasksByUrl = new Map();

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

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

function respondJson(res, code, payload) {
  respond(res, code, "application/json; charset=utf-8", JSON.stringify(payload));
}

function normalizeNamePart(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "page";
}

function createFileName(rawUrl, taskId) {
  const parsedUrl = new URL(rawUrl);
  const host = normalizeNamePart(parsedUrl.hostname || "page");
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  return `${host}-${timestamp}-${taskId.slice(0, 8)}.html`;
}

function taskPayload(task, message) {
  const payload = {
    message,
    taskId: task.id,
    url: task.url,
    status: task.status,
    outputDir: OUTPUT_DIR,
    createdAt: task.createdAt,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
  };

  if (task.status === "success") {
    payload.fileName = task.fileName;
  }

  if (task.status === "failed") {
    payload.error = task.error;
  }

  return payload;
}

function startTask(task) {
  const outChunks = [];
  const errChunks = [];

  function markFailure(message) {
    if (task.status !== "running") return;
    task.status = "failed";
    task.error = message || "Unknown error";
    task.finishedAt = new Date().toISOString();
  }

  function markSuccess() {
    if (task.status !== "running") return;
    task.status = "success";
    task.finishedAt = new Date().toISOString();
  }

  const child = spawn("single-file", [
    `--browser-executable-path=${BROWSER_EXECUTABLE_PATH}`,
    `--browser-args=${BROWSER_ARGS}`,
    task.url,
    task.filePath,
  ]);

  const timer = setTimeout(() => {
    child.kill();
    markFailure(`Request timed out after ${TIMEOUT / 1000} seconds`);
  }, TIMEOUT);

  child.stdout.on("data", (d) => outChunks.push(d));
  child.stderr.on("data", (d) => errChunks.push(d));

  child.on("close", (code) => {
    clearTimeout(timer);
    if (task.status !== "running") {
      return;
    }

    if (code === 0) {
      markSuccess();
      return;
    }

    const errBuf =
      errChunks.length > 0
        ? Buffer.concat(errChunks)
        : outChunks.length > 0
        ? Buffer.concat(outChunks)
        : Buffer.from(`single-file exited with code ${code}`);
    const errorMessage =
      errBuf.toString("utf-8").trim() || `single-file exited with code ${code}`;
    markFailure(errorMessage);
  });

  child.on("error", (err) => {
    clearTimeout(timer);
    markFailure(err.message);
  });
}

function getOrCreateTask(url) {
  const existing = tasksByUrl.get(url);
  if (existing) {
    return { task: existing, created: false };
  }

  const id = crypto.randomUUID();
  const fileName = createFileName(url, id);
  const filePath = path.join(OUTPUT_DIR, fileName);
  const task = {
    id,
    url,
    status: "running",
    fileName,
    filePath,
    error: null,
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };

  tasksByUrl.set(url, task);
  startTask(task);
  return { task, created: true };
}

function handleTaskRequest(rawUrl, res) {
  if (!rawUrl) {
    respondJson(res, 400, { message: "Missing url parameter" });
    return;
  }

  if (!validateUrl(rawUrl)) {
    respondJson(res, 400, { message: "Invalid or unsupported URL" });
    return;
  }

  const { task, created } = getOrCreateTask(rawUrl);

  if (task.status === "running") {
    const message = created ? "Task created" : "Task is running";
    respondJson(res, created ? 201 : 202, taskPayload(task, message));
    return;
  }

  if (task.status === "success") {
    respondJson(res, 200, taskPayload(task, "Task succeeded"));
    return;
  }

  respondJson(res, 200, taskPayload(task, "Task failed"));
}

function parsePostBody(req, res, onUrl) {
  const bodyChunks = [];
  req.on("data", (d) => bodyChunks.push(d));

  req.on("end", () => {
    const body = Buffer.concat(bodyChunks).toString("utf-8");
    const contentType = String(req.headers["content-type"] || "").toLowerCase();

    if (contentType.includes("application/json")) {
      let parsed;
      try {
        parsed = JSON.parse(body || "{}");
      } catch {
        respondJson(res, 400, { message: "Invalid JSON body" });
        return;
      }

      const url = Array.isArray(parsed.url) ? parsed.url[0] : parsed.url;
      onUrl(url);
      return;
    }

    const params = querystring.parse(body);
    const url = Array.isArray(params.url) ? params.url[0] : params.url;
    onUrl(url);
  });

  req.on("error", (err) => {
    respondJson(res, 400, { message: err.message || "Failed to read request body" });
  });
}

const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);

  if (reqUrl.pathname === "/health") {
    respond(res, 200, "text/plain", "OK");
    return;
  }

  if (!TASK_ENDPOINTS.has(reqUrl.pathname)) {
    respond(res, 404, "text/plain", "Not Found");
    return;
  }

  if (req.method === "GET") {
    const url = reqUrl.searchParams.get("url");
    handleTaskRequest(url, res);
    return;
  }

  if (req.method === "POST") {
    parsePostBody(req, res, (url) => {
      handleTaskRequest(url, res);
    });
    return;
  }

  respondJson(res, 405, { message: "Method Not Allowed" });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`SingleFile WEBService listening on port ${PORT}`);
  console.log(`Task output directory: ${OUTPUT_DIR}`);
});
