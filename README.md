# SingleFile WEBService

A Docker-based HTTP web service that wraps [single-file-cli](https://github.com/gildas-lormeau/single-file-cli), allowing you to archive web pages as self-contained single HTML files through HTTP requests.

## Quick Start

### Using Docker Compose

```bash
docker-compose up -d
```

### Using Docker

```bash
docker build -t singlefile-webservice .
docker run -p 8080:8080 singlefile-webservice
```

## API

### `GET /`

Save a web page and return its content as a single HTML file.

**Query Parameters:**

| Parameter | Required | Description                      |
|-----------|----------|----------------------------------|
| `url`     | Yes      | The URL of the page to archive   |

**Example:**

```bash
curl "http://localhost:8080/?url=https://www.example.com"
```

### `POST /`

Save a web page and return its content as a single HTML file.

**Body (`application/x-www-form-urlencoded`):**

| Parameter | Required | Description                      |
|-----------|----------|----------------------------------|
| `url`     | Yes      | The URL of the page to archive   |

**Example:**

```bash
curl -d "url=https://www.example.com" http://localhost:8080/
```

### `GET /health`

Health check endpoint. Returns `200 OK` when the service is running.

**Example:**

```bash
curl http://localhost:8080/health
```

## Environment Variables

| Variable                  | Default                        | Description                                   |
|---------------------------|--------------------------------|-----------------------------------------------|
| `PORT`                    | `8080`                         | Port the server listens on                    |
| `TIMEOUT`                 | `60`                           | Request timeout in seconds                    |
| `BROWSER_EXECUTABLE_PATH` | `/usr/bin/chromium-browser`    | Path to the browser executable                |
| `BROWSER_ARGS`            | `["--no-sandbox"]`             | Browser arguments in JSON array format        |

## License

This project is licensed under the MIT License.