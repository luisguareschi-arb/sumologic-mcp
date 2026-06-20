import type { SumoClient } from './client.js';
import type {
  Message,
  MessagesResponse,
  RecordsResponse,
  ResultType,
  SearchOptions,
  SearchResult,
} from './types.js';
import { maskSensitiveInfo } from '../utils/pii.js';

const DONE_STATE = 'DONE GATHERING RESULTS';
const FAILED_STATES = new Set(['FAILED', 'CANCELLED']);

function toIsoTimestamp(date: Date): string {
  return date.toISOString().slice(0, 19);
}

function sanitizeMessage(message: Message): Message {
  if (message.map && typeof message.map === 'object') {
    const plainMap: Record<string, string> = {};
    for (const [key, value] of Object.entries(message.map)) {
      const rawValue = value?.toString() ?? '';
      plainMap[key] = key === '_raw' || key === 'response' ? maskSensitiveInfo(rawValue) : rawValue;
    }

    return {
      ...message,
      map: plainMap,
      _raw: message._raw ? maskSensitiveInfo(message._raw.toString()) : message._raw,
      response: message.response
        ? maskSensitiveInfo(message.response.toString())
        : message.response,
    };
  }

  if (message._raw && typeof message._raw === 'string') {
    return { ...message, _raw: maskSensitiveInfo(message._raw) };
  }

  if (message.response && typeof message.response === 'string') {
    return { ...message, response: maskSensitiveInfo(message.response) };
  }

  return message;
}

function sanitizeMessages(response: MessagesResponse): MessagesResponse {
  return {
    ...response,
    messages: response.messages.map(sanitizeMessage),
  };
}

function sanitizeRecords(response: RecordsResponse): RecordsResponse {
  return {
    ...response,
    records: response.records.map(sanitizeMessage),
  };
}

async function waitForJobCompletion(
  client: SumoClient,
  jobId: string,
  timeoutMs: number,
): Promise<{ state: string; messageCount: number; recordCount: number; pendingErrors: unknown[] }> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const status = await client.getStatus(jobId);

    if (FAILED_STATES.has(status.state)) {
      const errorDetails =
        status.pendingErrors.length > 0 ? `: ${JSON.stringify(status.pendingErrors)}` : '';
      throw new Error(`Search job ${status.state.toLowerCase()}${errorDetails}`);
    }

    if (status.state === DONE_STATE) {
      return {
        state: status.state,
        messageCount: status.messageCount,
        recordCount: status.recordCount,
        pendingErrors: status.pendingErrors,
      };
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Search job timed out after ${timeoutMs}ms`);
}

export async function search(
  client: SumoClient,
  query: string,
  options: SearchOptions = {},
): Promise<SearchResult> {
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const from = options.from ?? toIsoTimestamp(defaultFrom);
  const to = options.to ?? toIsoTimestamp(now);
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 10_000);
  const offset = Math.max(options.offset ?? 0, 0);
  const resultType: ResultType = options.resultType ?? 'messages';
  const timeZone = options.timeZone ?? 'UTC';
  const timeoutMs = options.timeoutMs ?? 300_000;

  const cleanedQuery = query.replace(/\n/g, ' ').trim();

  const { id: jobId } = await client.createJob({
    query: cleanedQuery,
    from,
    to,
    timeZone,
  });

  try {
    const status = await waitForJobCompletion(client, jobId, timeoutMs);

    const result: SearchResult = {
      jobId,
      state: status.state,
      messageCount: status.messageCount,
      recordCount: status.recordCount,
    };

    const pagination = { offset, limit };

    if (resultType === 'messages' || resultType === 'both') {
      const messages = await client.getMessages(jobId, pagination);
      result.messages = sanitizeMessages(messages);
    }

    if (resultType === 'records' || resultType === 'both') {
      const records = await client.getRecords(jobId, pagination);
      result.records = sanitizeRecords(records);
    }

    return result;
  } finally {
    try {
      await client.deleteJob(jobId);
    } catch {
      // Best-effort cleanup; don't mask search results.
    }
  }
}
