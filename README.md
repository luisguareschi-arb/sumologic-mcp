# sumologic-mcp

A local MCP server that lets AI assistants run Sumo Logic log searches over HTTP.

## Prerequisites

- Node.js 18+
- A Sumo Logic **Enterprise** account with Search Job API access
- Sumo Logic API access key and ID ([create one here](https://help.sumologic.com/docs/manage/security/access-keys/))

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy the example env file and fill in your credentials:

```bash
cp .env.example .env
```

3. Set your deployment endpoint in `.env`. Examples:

| Deployment | ENDPOINT                               |
| ---------- | -------------------------------------- |
| US1        | `https://api.sumologic.com/api/v1`     |
| US2        | `https://api.us2.sumologic.com/api/v1` |
| EU         | `https://api.eu.sumologic.com/api/v1`  |

4. Build and start:

```bash
npm run build
npm start
```

For development with auto-reload:

```bash
npm run dev
```

The server listens on `http://localhost:3006` by default.

## Cursor MCP configuration

Add this to your Cursor MCP config (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "sumologic": {
      "url": "http://localhost:3006/mcp"
    }
  }
}
```

Restart the MCP server in Cursor after starting the local server.

## Available tools

### `search_sumologic`

Run a Sumo Logic search and return results.

| Parameter    | Type   | Default    | Description                      |
| ------------ | ------ | ---------- | -------------------------------- |
| `query`      | string | required   | Sumo Logic search query          |
| `from`       | string | 24h ago    | ISO 8601 start time              |
| `to`         | string | now        | ISO 8601 end time                |
| `limit`      | number | 100        | Max results (1–10000)            |
| `offset`     | number | 0          | Pagination offset                |
| `resultType` | string | `messages` | `messages`, `records`, or `both` |

**Example queries:**

- Raw logs: `* | where severity = "error" | limit 20`
- Count by service: `* | count by _sourceCategory`
- Time-bounded: use `from` and `to` params with ISO 8601 timestamps

Use `resultType: "messages"` for raw log lines, `records` for aggregate/tabular results, and `both` when unsure.

## Environment variables

| Variable            | Required | Default  | Description                                 |
| ------------------- | -------- | -------- | ------------------------------------------- |
| `ENDPOINT`          | yes      | —        | Sumo Logic API base URL                     |
| `SUMO_API_ID`       | yes      | —        | Access ID                                   |
| `SUMO_API_KEY`      | yes      | —        | Access key                                  |
| `PORT`              | no       | `3006`   | HTTP server port                            |
| `TIMEZONE`          | no       | `UTC`    | Timezone for search jobs                    |
| `SEARCH_TIMEOUT_MS` | no       | `300000` | Max wait time for search completion (5 min) |

## Health check

```bash
curl http://localhost:3006/health
```

## Notes

- Search results have PII fields (`_raw`, `response`) automatically redacted before being returned to the AI.
- The Search Job API requires session cookies across requests; this server handles that automatically.
- If you get a 403 error, your account may not have Enterprise Search Job API access.
