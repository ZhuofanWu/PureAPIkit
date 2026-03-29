import { create } from 'zustand'
import type {
  BodyFormat,
  BodyMode,
  HttpMethod,
  KeyValueRow,
  RequestPanel,
  ResponsePanel,
  ResponsePayload,
} from '../types/api'

let rowSeed = 0

function createRow(partial?: Partial<KeyValueRow>): KeyValueRow {
  rowSeed += 1

  return {
    id: `row-${rowSeed}`,
    enabled: false,
    key: '',
    value: '',
    description: '',
    ...partial,
  }
}

function normalizeRows(rows: KeyValueRow[]) {
  const meaningfulRows = rows.filter(
    (row) =>
      row.enabled ||
      row.key.trim() ||
      row.value.trim() ||
      row.description.trim(),
  )

  return [...meaningfulRows, createRow()]
}

interface ApiClientState {
  method: HttpMethod
  url: string
  params: KeyValueRow[]
  headers: KeyValueRow[]
  requestPanel: RequestPanel
  responsePanel: ResponsePanel
  bodyMode: BodyMode
  bodyFormat: BodyFormat
  bodyText: string
  loading: boolean
  error: string | null
  response: ResponsePayload | null
  setMethod: (method: HttpMethod) => void
  setUrl: (url: string) => void
  updateParamRow: (id: string, patch: Partial<KeyValueRow>) => void
  updateHeaderRow: (id: string, patch: Partial<KeyValueRow>) => void
  setRequestPanel: (requestPanel: RequestPanel) => void
  setResponsePanel: (responsePanel: ResponsePanel) => void
  setBodyMode: (bodyMode: BodyMode) => void
  setBodyFormat: (bodyFormat: BodyFormat) => void
  setBodyText: (bodyText: string) => void
  startRequest: () => void
  finishRequest: (response: ResponsePayload) => void
  failRequest: (error: string) => void
}

export const useApiClientStore = create<ApiClientState>((set) => ({
  method: 'GET',
  url: '',
  params: [createRow()],
  headers: normalizeRows([
    createRow({
      enabled: true,
      key: 'Content-Type',
      value: 'application/json',
      description: 'JSON request body',
    }),
  ]),
  requestPanel: 'headers',
  responsePanel: 'body',
  bodyMode: 'raw',
  bodyFormat: 'JSON',
  bodyText: '',
  loading: false,
  error: null,
  response: null,
  setMethod: (method) => set({ method }),
  setUrl: (url) => set({ url }),
  updateParamRow: (id, patch) =>
    set((state) => ({
      params: normalizeRows(
        state.params.map((row) => (row.id === id ? { ...row, ...patch } : row)),
      ),
    })),
  updateHeaderRow: (id, patch) =>
    set((state) => ({
      headers: normalizeRows(
        state.headers.map((row) => (row.id === id ? { ...row, ...patch } : row)),
      ),
    })),
  setRequestPanel: (requestPanel) => set({ requestPanel }),
  setResponsePanel: (responsePanel) => set({ responsePanel }),
  setBodyMode: (bodyMode) => set({ bodyMode }),
  setBodyFormat: (bodyFormat) => set({ bodyFormat }),
  setBodyText: (bodyText) => set({ bodyText }),
  startRequest: () =>
    set({
      loading: true,
      error: null,
      response: null,
    }),
  finishRequest: (response) =>
    set({
      loading: false,
      error: null,
      response,
    }),
  failRequest: (error) =>
    set({
      loading: false,
      error,
      response: null,
    }),
}))
