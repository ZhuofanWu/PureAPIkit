export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export type RequestPanel = 'params' | 'headers' | 'body' | 'auth'

export type ResponsePanel = 'body' | 'headers' | 'cookies'

export type BodyMode = 'none' | 'raw'

export type BodyFormat = 'JSON' | 'Text' | 'XML'

export interface KeyValueRow {
  id: string
  enabled: boolean
  key: string
  value: string
  description: string
}

export interface RequestPayload {
  method: HttpMethod
  url: string
  headers: Record<string, string>
  body: string | null
}

export interface ResponsePayload {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  durationMs: number
}
