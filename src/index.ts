import { config } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import { z } from 'zod';
import { loadConfig } from './config.js';
import { createBearerAuthMiddleware } from './middleware/auth.js';
import { createClient } from './sumologic/client.js';
import { search } from './sumologic/search.js';
import { safeStringify } from './utils/json.js';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: join(projectRoot, '.env') });

const appConfig = loadConfig();
const sumoClient = createClient({
  endpoint: appConfig.endpoint,
  sumoApiId: appConfig.SUMO_API_ID,
  sumoApiKey: appConfig.SUMO_API_KEY,
});

const SEARCH_TOOL_DESCRIPTION =
  'Run a Sumo Logic log search query and return results. Use for investigating logs, errors, and metrics. ' +
  'Provide a valid Sumo query string. Optionally set from/to ISO 8601 timestamps, limit (1-10000), offset, ' +
  'and resultType (messages for raw logs, records for aggregates, both for mixed queries).';

function createServer(): McpServer {
  const server = new McpServer({
    name: 'sumologic-mcp',
    version: '1.0.0',
  });

  server.registerTool(
    'search_sumologic',
    {
      description: SEARCH_TOOL_DESCRIPTION,
      inputSchema: {
        query: z.string().describe('Sumo Logic search query'),
        from: z.string().optional().describe('ISO 8601 start time (defaults to 24 hours ago)'),
        to: z.string().optional().describe('ISO 8601 end time (defaults to now)'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(10_000)
          .optional()
          .describe('Max results to return (default 100)'),
        offset: z.number().int().min(0).optional().describe('Pagination offset (default 0)'),
        resultType: z
          .enum(['messages', 'records', 'both'])
          .optional()
          .describe(
            'Result format: messages for raw logs, records for aggregates, both for mixed queries',
          ),
      },
    },
    async ({ query, from, to, limit, offset, resultType }) => {
      try {
        const results = await search(sumoClient, query, {
          from,
          to,
          limit,
          offset,
          resultType,
          timeZone: appConfig.TIMEZONE,
          timeoutMs: appConfig.SEARCH_TIMEOUT_MS,
        });

        return {
          content: [
            {
              type: 'text',
              text: safeStringify(results),
            },
          ],
        };
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error');
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
        };
      }
    },
  );

  return server;
}

async function runStdio(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function runHttpServer(): Promise<void> {
  if (!appConfig.MCP_API_KEY) {
    throw new Error(
      'MCP_API_KEY is required when running in HTTP mode. Generate one with: openssl rand -hex 32',
    );
  }

  const app = express();
  app.use(express.json());

  const bearerAuth = createBearerAuthMiddleware(appConfig.MCP_API_KEY);
  const transports: Record<string, StreamableHTTPServerTransport> = {};

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'sumologic-mcp',
      version: '1.0.0',
      enabled_tools: ['search_sumologic'],
    });
  });

  app.post('/mcp', bearerAuth, async (req, res) => {
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports[sessionId]) {
        transport = transports[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (newSessionId) => {
            transports[newSessionId] = transport;
            console.error(`New MCP session initialized: ${newSessionId}`);
          },
        });

        transport.onclose = () => {
          if (transport.sessionId) {
            console.error(`MCP session closed: ${transport.sessionId}`);
            delete transports[transport.sessionId];
          }
        };

        const server = createServer();
        await server.connect(transport);
      } else {
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided',
          },
          id: null,
        });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('Error handling MCP request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  });

  const handleSessionRequest = async (req: express.Request, res: express.Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  };

  app.get('/mcp', bearerAuth, handleSessionRequest);
  app.delete('/mcp', bearerAuth, handleSessionRequest);

  const port = appConfig.PORT;

  app.listen(port, '0.0.0.0', () => {
    console.error(`Sumo Logic MCP server running on http://0.0.0.0:${port}`);
    console.error(`Health check: http://0.0.0.0:${port}/health`);
    console.error(`MCP endpoint: http://0.0.0.0:${port}/mcp`);
  });
}

const useStdio = process.argv.includes('--stdio');

(useStdio ? runStdio() : runHttpServer()).catch((error) => {
  console.error('Failed to start Sumo Logic MCP server:', error);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.error('Shutting down Sumo Logic MCP server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('Shutting down Sumo Logic MCP server...');
  process.exit(0);
});
