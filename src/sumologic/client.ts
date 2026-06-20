import makeFetchCookie from 'fetch-cookie';
import { CookieJar } from 'tough-cookie';
import type {
  ClientOptions,
  JobOptions,
  JobResponse,
  JobStatus,
  MessagesResponse,
  PaginationOptions,
  RecordsResponse,
} from './types.js';

export class SumoLogicError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'SumoLogicError';
  }
}

export class SumoClient {
  private readonly endpoint: string;
  private readonly authHeader: string;
  private readonly fetchWithCookies: typeof fetch;

  constructor(options: ClientOptions) {
    this.endpoint = options.endpoint;
    const credentials = Buffer.from(`${options.sumoApiId}:${options.sumoApiKey}`).toString(
      'base64',
    );
    this.authHeader = `Basic ${credentials}`;
    this.fetchWithCookies = makeFetchCookie(fetch, new CookieJar());
  }

  async createJob(params: JobOptions): Promise<JobResponse> {
    return this.request<JobResponse>('POST', '/search/jobs', params);
  }

  async getStatus(id: string): Promise<JobStatus> {
    return this.request<JobStatus>('GET', `/search/jobs/${id}`);
  }

  async getMessages(id: string, pagination: PaginationOptions): Promise<MessagesResponse> {
    const query = new URLSearchParams({
      offset: String(pagination.offset),
      limit: String(pagination.limit),
    });
    return this.request<MessagesResponse>('GET', `/search/jobs/${id}/messages?${query}`);
  }

  async getRecords(id: string, pagination: PaginationOptions): Promise<RecordsResponse> {
    const query = new URLSearchParams({
      offset: String(pagination.offset),
      limit: String(pagination.limit),
    });
    return this.request<RecordsResponse>('GET', `/search/jobs/${id}/records?${query}`);
  }

  async deleteJob(id: string): Promise<void> {
    await this.request<void>('DELETE', `/search/jobs/${id}`);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.endpoint}${path}`;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: this.authHeader,
    };

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await this.fetchWithCookies(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      let errorBody: unknown;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = await response.text();
      }

      const message =
        typeof errorBody === 'object' && errorBody !== null && 'message' in errorBody
          ? String((errorBody as { message: unknown }).message)
          : `Sumo Logic API error: ${response.status} ${response.statusText}`;

      throw new SumoLogicError(message, response.status, errorBody);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }
}

export function createClient(options: ClientOptions): SumoClient {
  return new SumoClient(options);
}
