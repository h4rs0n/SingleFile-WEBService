# SingleFile WEBService

A Docker-based HTTP web service that wraps [single-file-cli](https://github.com/gildas-lormeau/single-file-cli), allowing you to archive web pages as self-contained single HTML files through asynchronous HTTP tasks.

## Quick Start

### Using Docker Compose

```bash
docker-compose up -d
```

### Using Docker

```bash
docker build -t singlefile-webservice .
mkdir -p output
docker run -p 8080:8080 \
	-e OUTPUT_DIR=/usr/src/app/output \
	-v "$(pwd)/output:/usr/src/app/output" \
	singlefile-webservice
```

## API

### `POST /task/create`

Create a save task for a web page.

- The service saves the resulting HTML file into the default output directory (`OUTPUT_DIR`, defaults to current working directory).
- If a task for the same URL already exists, this endpoint returns the current task status instead of creating a duplicate task.

**Body (`application/x-www-form-urlencoded` or `application/json`):**

| Parameter | Required | Description                    |
|-----------|----------|--------------------------------|
| `url`     | Yes      | The URL of the page to archive |

**Examples:**

```bash
curl -d "url=https://www.example.com" http://localhost:8080/task/create
```

```bash
curl -H "Content-Type: application/json" \
	-d '{"url":"https://www.example.com"}' \
	http://localhost:8080/task/create
```

### `GET /task/create`

Create a task or query task status for the same URL (idempotent by URL).

**Query Parameters:**

| Parameter | Required | Description                    |
|-----------|----------|--------------------------------|
| `url`     | Yes      | The URL of the page to archive |

**Example:**

```bash
curl "http://localhost:8080/task/create?url=https://www.example.com"
```

### Response Behavior

- Task just created: returns `201` with `status: running`
- Task still running: returns `202` with `status: running`
- Task succeeded: returns `200` with `status: success` and `fileName`
- Task failed: returns `200` with `status: failed` and `error`

**Running Example:**

```json
{
	"message": "Task is running",
	"taskId": "f9f4bf6f-a42b-40ce-a6f1-8b8866f47734",
	"url": "https://www.example.com",
	"status": "running",
	"outputDir": "/usr/src/app/output",
	"createdAt": "2026-04-13T08:35:20.175Z",
	"startedAt": "2026-04-13T08:35:20.175Z",
	"finishedAt": null
}
```

**Success Example:**

```json
{
	"message": "Task succeeded",
	"taskId": "f9f4bf6f-a42b-40ce-a6f1-8b8866f47734",
	"url": "https://www.example.com",
	"status": "success",
	"outputDir": "/usr/src/app/output",
	"createdAt": "2026-04-13T08:35:20.175Z",
	"startedAt": "2026-04-13T08:35:20.175Z",
	"finishedAt": "2026-04-13T08:35:28.119Z",
	"fileName": "www-example-com-20260413T083520Z-f9f4bf6f.html"
}
```

**Failed Example:**

```json
{
	"message": "Task failed",
	"taskId": "f9f4bf6f-a42b-40ce-a6f1-8b8866f47734",
	"url": "https://www.example.com",
	"status": "failed",
	"outputDir": "/usr/src/app/output",
	"createdAt": "2026-04-13T08:35:20.175Z",
	"startedAt": "2026-04-13T08:35:20.175Z",
	"finishedAt": "2026-04-13T08:36:20.175Z",
	"error": "Request timed out after 60 seconds"
}
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
| `OUTPUT_DIR`              | current working directory      | Directory where HTML files are saved          |

## License

This project is licensed under the MIT License.