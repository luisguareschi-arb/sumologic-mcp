import { z } from 'zod';

const envSchema = z.object({
  ENDPOINT: z.string().min(1, 'ENDPOINT is required'),
  SUMO_API_ID: z.string().min(1, 'SUMO_API_ID is required'),
  SUMO_API_KEY: z.string().min(1, 'SUMO_API_KEY is required'),
  PORT: z.coerce.number().int().positive().default(3006),
  TIMEZONE: z.string().default('UTC'),
  SEARCH_TIMEOUT_MS: z.coerce.number().int().positive().default(300_000),
  NODE_ENV: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function normalizeEndpoint(endpoint: string): string {
  let normalized = endpoint.trim().replace(/\/+$/, '');

  if (!normalized.endsWith('/v1')) {
    if (normalized.endsWith('/api')) {
      normalized += '/v1';
    } else if (!normalized.includes('/api/v1')) {
      normalized += '/api/v1';
    }
  }

  return normalized;
}

export function loadConfig(): Env & { endpoint: string } {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const messages = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${messages}`);
  }

  return {
    ...parsed.data,
    endpoint: normalizeEndpoint(parsed.data.ENDPOINT),
  };
}
