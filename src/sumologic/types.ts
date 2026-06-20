export interface JobResponse {
  status: number;
  id: string;
  code: string;
  message: string;
}

export interface HistogramBucket {
  length: number;
  count: number;
  startTimestamp: number;
}

export interface JobStatus {
  state: string;
  messageCount: number;
  histogramBuckets: HistogramBucket[];
  pendingErrors: unknown[];
  pendingWarnings: unknown[];
  recordCount: number;
}

export interface Field {
  name: string;
  fieldType: string;
  keyField: boolean;
}

export interface Message {
  map: Record<string, string>;
  _raw?: string;
  response?: string;
  [key: string]: unknown;
}

export interface MessagesResponse {
  fields: Field[];
  messages: Message[];
}

export interface RecordsResponse {
  fields: Field[];
  records: Message[];
}

export interface JobOptions {
  query: string;
  from: string;
  to: string;
  timeZone: string;
}

export interface PaginationOptions {
  offset: number;
  limit: number;
}

export interface ClientOptions {
  endpoint: string;
  sumoApiId: string;
  sumoApiKey: string;
}

export type ResultType = 'messages' | 'records' | 'both';

export interface SearchOptions {
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
  resultType?: ResultType;
  timeZone?: string;
  timeoutMs?: number;
}

export interface SearchResult {
  messages?: MessagesResponse;
  records?: RecordsResponse;
  jobId: string;
  state: string;
  messageCount?: number;
  recordCount?: number;
}
