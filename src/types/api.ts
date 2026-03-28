export type HttpMethod = 'GET' | 'POST'

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
