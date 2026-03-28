import { create } from 'zustand'
import type { HttpMethod, ResponsePayload } from '../types/api'

interface ApiClientState {
  method: HttpMethod
  url: string
  headersText: string
  bodyText: string
  loading: boolean
  error: string | null
  response: ResponsePayload | null
  setMethod: (method: HttpMethod) => void
  setUrl: (url: string) => void
  setHeadersText: (headersText: string) => void
  setBodyText: (bodyText: string) => void
  startRequest: () => void
  finishRequest: (response: ResponsePayload) => void
  failRequest: (error: string) => void
}

export const useApiClientStore = create<ApiClientState>((set) => ({
  method: 'GET',
  url: '',
  headersText: '',
  bodyText: '',
  loading: false,
  error: null,
  response: null,
  setMethod: (method) => set({ method }),
  setUrl: (url) => set({ url }),
  setHeadersText: (headersText) => set({ headersText }),
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
