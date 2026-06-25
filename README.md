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

4. Build:

```bash
npm run build
```

### Option A: Cursor launches the server automatically (recommended)

Cursor can spawn the MCP process for you over stdio — no need to run `npm start` manually.

Add this to your Cursor MCP config (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "sumologic": {
      "command": "node",
      "args": ["/absolute/path/to/sumologic-mcp/dist/index.js", "--stdio"],
      "env": {
        "ENDPOINT": "https://api.sumologic.com/api/v1",
        "SUMO_API_ID": "your-access-id",
        "SUMO_API_KEY": "your-access-key"
      }
    }
  }
}
```

Replace `/absolute/path/to/sumologic-mcp` with the real path to this repo. Credentials can also live in the project's `.env` file (loaded automatically from the project root).

For development without building, use `npx tsx`:

```json
{
  "mcpServers": {
    "sumologic": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/sumologic-mcp/src/index.ts", "--stdio"]
    }
  }
}
```

Restart or reload MCP servers in Cursor after changing the config.

### Option B: HTTP server (local development)

Start the server manually:

```bash
npm start
```

For development with auto-reload:

```bash
npm run dev
```

HTTP mode requires `MCP_API_KEY` in your `.env`. Generate one with:

```bash
openssl rand -hex 32
```

The server listens on `http://localhost:3006` by default.

Add this to your Cursor MCP config:

```json
{
  "mcpServers": {
    "sumologic": {
      "url": "http://localhost:3006/mcp",
      "headers": {
        "Authorization": "Bearer ${env:SUMOLOGIC_MCP_API_KEY}"
      }
    }
  }
}
```

Set `SUMOLOGIC_MCP_API_KEY` in your shell to match `MCP_API_KEY` in `.env`.

Restart the MCP server in Cursor after starting the local server.

### Option C: Docker (public cloud hosting)

Run the MCP server on a cloud VM with TLS and API key authentication. Caddy terminates HTTPS and proxies to the app container; port 3006 is not exposed to the host.

#### Prerequisites

- A domain name (e.g. `mcp.yourcompany.com`) with an A record pointing to your VM's public IP
- Firewall rules allowing inbound traffic on ports 80 and 443 only
- Docker and Docker Compose installed on the VM

#### Setup

1. Copy and configure environment variables on the VM:

```bash
cp .env.example .env
```

Set these values in `.env`:

| Variable | Description |
| -------- | ----------- |
| `ENDPOINT` | Sumo Logic API base URL |
| `SUMO_API_ID` | Sumo Logic access ID |
| `SUMO_API_KEY` | Sumo Logic access key |
| `MCP_API_KEY` | Shared Bearer token for MCP clients (`openssl rand -hex 32`) |
| `MCP_DOMAIN` | Public hostname (e.g. `mcp.yourcompany.com`) |

2. Start the stack:

```bash
docker compose up -d
```

Caddy obtains a Let's Encrypt certificate automatically for `MCP_DOMAIN`.

#### Verify deployment

Health check (no auth required):

```bash
curl https://mcp.yourcompany.com/health
```

MCP endpoint rejects unauthenticated requests:

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST https://mcp.yourcompany.com/mcp
# Expected: 401
```

Authenticated request:

```bash
curl -X POST https://mcp.yourcompany.com/mcp \
  -H "Authorization: Bearer $MCP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}},"id":1}'
```

#### Cursor client config (remote)

```json
{
  "mcpServers": {
    "sumologic": {
      "url": "https://mcp.yourcompany.com/mcp",
      "headers": {
        "Authorization": "Bearer ${env:SUMOLOGIC_MCP_API_KEY}"
      }
    }
  }
}
```

Set `SUMOLOGIC_MCP_API_KEY` in your local shell to match `MCP_API_KEY` on the server.

#### Security notes

- Never commit `.env` or expose `MCP_API_KEY` in client configs — use `${env:...}` interpolation
- Rotate `MCP_API_KEY` if it is leaked; all clients must update their env var
- Restrict the VM security group to known IP ranges if your team has fixed egress
- Sumo credentials stay server-side; clients only need the MCP Bearer token

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
| `MCP_API_KEY`       | HTTP only | —       | Bearer token for `/mcp` requests            |
| `MCP_DOMAIN`        | Docker   | —        | Public hostname for Caddy TLS               |
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
