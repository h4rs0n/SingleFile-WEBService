#!/usr/bin/env python3
"""SingleFile WEBService - HTTP wrapper for single-file-cli"""

import os
import subprocess
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

PORT = int(os.environ.get("PORT", 8080))
TIMEOUT = int(os.environ.get("TIMEOUT", 60))
BROWSER_EXECUTABLE_PATH = os.environ.get(
    "BROWSER_EXECUTABLE_PATH", "/usr/bin/chromium-browser"
)
BROWSER_ARGS = os.environ.get("BROWSER_ARGS", '["--no-sandbox"]')


class SingleFileHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path == "/health":
            self._respond(200, "text/plain", b"OK")
            return

        params = parse_qs(parsed.query)
        urls = params.get("url", [])
        if not urls:
            self._respond(400, "text/plain", b"Missing url parameter")
            return

        self._fetch(urls[0])

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length).decode("utf-8")
        params = parse_qs(body)

        urls = params.get("url", [])
        if not urls:
            self._respond(400, "text/plain", b"Missing url parameter")
            return

        self._fetch(urls[0])

    @staticmethod
    def _validate_url(url):
        """Return True only for well-formed http/https URLs."""
        try:
            parsed = urlparse(url)
            return parsed.scheme in ("http", "https") and bool(parsed.netloc)
        except Exception:
            return False

    def _fetch(self, url):
        if not self._validate_url(url):
            self._respond(400, "text/plain", b"Invalid or unsupported URL")
            return
        try:
            result = subprocess.run(
                [
                    "single-file",
                    f"--browser-executable-path={BROWSER_EXECUTABLE_PATH}",
                    f"--browser-args={BROWSER_ARGS}",
                    url,
                    "--dump-content",
                ],
                capture_output=True,
                timeout=TIMEOUT,
            )
            if result.returncode == 0:
                self._respond(200, "text/html; charset=utf-8", result.stdout)
            else:
                error = result.stderr or result.stdout or b"Unknown error"
                self._respond(500, "text/plain", error)
        except subprocess.TimeoutExpired:
            self._respond(504, "text/plain", b"Request timed out")
        except Exception as e:
            self._respond(500, "text/plain", str(e).encode())

    def _respond(self, code, content_type, body):
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        print(f"[{self.address_string()}] {fmt % args}")


if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", PORT), SingleFileHandler)
    print(f"SingleFile WEBService listening on port {PORT}")
    server.serve_forever()
