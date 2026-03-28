import { invoke } from '@tauri-apps/api/core'
import type { FormEvent } from 'react'
import { useApiClientStore } from './store/useApiClientStore'
import type {
  HttpMethod,
  RequestPayload,
  ResponsePayload,
} from './types/api'

const editorClassName =
  'min-h-[280px] w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-sm leading-6 text-slate-700 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100'

const headerPlaceholder = `{
  "Content-Type": "application/json",
  "Authorization": "Bearer <token>"
}`

const bodyPlaceholder = `{
  "message": "hello"
}`

function parseHeaders(input: string) {
  if (!input.trim()) {
    return {}
  }

  let parsed: Record<string, unknown>

  try {
    parsed = JSON.parse(input) as Record<string, unknown>
  } catch {
    throw new Error('请求头 JSON 格式不正确。')
  }

  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('请求头必须是一个 JSON 对象。')
  }

  return Object.fromEntries(
    Object.entries(parsed).map(([key, value]) => {
      if (!key.trim()) {
        throw new Error('请求头名称不能为空。')
      }

      if (
        typeof value !== 'string' &&
        typeof value !== 'number' &&
        typeof value !== 'boolean'
      ) {
        throw new Error(`请求头 "${key}" 的值必须是字符串、数字或布尔值。`)
      }

      return [key, String(value)]
    }),
  )
}

function formatMaybeJson(value: string) {
  if (!value.trim()) {
    return ''
  }

  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}

function getErrorMessage(error: unknown) {
  if (typeof error === 'string') {
    return error
  }

  if (error instanceof Error) {
    return error.message
  }

  return '请求失败。'
}

function App() {
  const {
    method,
    url,
    headersText,
    bodyText,
    loading,
    error,
    response,
    setMethod,
    setUrl,
    setHeadersText,
    setBodyText,
    startRequest,
    finishRequest,
    failRequest,
  } = useApiClientStore()

  const responseHeaders = response
    ? JSON.stringify(response.headers, null, 2)
    : ''
  const responseBody = response ? formatMaybeJson(response.body) : ''

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    try {
      const request: RequestPayload = {
        method,
        url,
        headers: parseHeaders(headersText),
        body: method === 'POST' ? bodyText : null,
      }

      startRequest()
      const result = await invoke<ResponsePayload>('send_request', { request })
      finishRequest(result)
    } catch (submitError) {
      failRequest(getErrorMessage(submitError))
    }
  }

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-4 py-4 lg:px-6">
        <main className="flex min-h-0 flex-1 flex-col rounded-[30px] border border-white/70 bg-white/85 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur">
          <header className="border-b border-slate-200 px-5 py-4 lg:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-700">
                  PureAPIkit
                </p>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                  Minimal Local API Client
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  只保留请求与响应，不引入额外功能。真实网络请求始终由 Rust
                  reqwest 发送。
                </p>
              </div>
              <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                Local only
              </div>
            </div>
          </header>

          <form
            className="flex flex-1 flex-col gap-4 p-4 lg:p-6"
            onSubmit={handleSubmit}
          >
            <section className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] lg:p-4">
              <div className="flex flex-col gap-3 xl:flex-row">
                <label className="sr-only" htmlFor="method">
                  请求方法
                </label>
                <select
                  id="method"
                  className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100 xl:w-[132px]"
                  value={method}
                  onChange={(event) =>
                    setMethod(event.currentTarget.value as HttpMethod)
                  }
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                </select>

                <label className="sr-only" htmlFor="url">
                  请求地址
                </label>
                <input
                  id="url"
                  className="h-12 flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                  placeholder="https://httpbin.org/get"
                  spellCheck={false}
                  value={url}
                  onChange={(event) => setUrl(event.currentTarget.value)}
                />

                <button
                  className="h-12 rounded-2xl bg-sky-600 px-6 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300 xl:w-[148px]"
                  disabled={loading || !url.trim()}
                  type="submit"
                >
                  {loading ? '发送中...' : 'Send'}
                </button>
              </div>
            </section>

            <section className="grid min-h-0 gap-4 xl:grid-cols-2">
              <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4">
                <div className="mb-3">
                  <h2 className="text-sm font-semibold text-slate-900">Headers</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    使用 JSON 对象定义请求头。
                  </p>
                </div>
                <textarea
                  className={editorClassName}
                  placeholder={headerPlaceholder}
                  spellCheck={false}
                  value={headersText}
                  onChange={(event) => setHeadersText(event.currentTarget.value)}
                />
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">Body</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      直接输入原始请求体，POST 时发送。
                    </p>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-500">
                    {method === 'POST' ? 'POST body enabled' : 'GET ignores body'}
                  </span>
                </div>
                <textarea
                  className={editorClassName}
                  placeholder={bodyPlaceholder}
                  spellCheck={false}
                  value={bodyText}
                  onChange={(event) => setBodyText(event.currentTarget.value)}
                />
              </div>
            </section>

            <section className="flex min-h-0 flex-1 flex-col rounded-[24px] border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Response</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    返回状态、响应头和响应体。
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-500">
                    {response
                      ? `${response.status} ${response.statusText || ''}`.trim()
                      : 'No response'}
                  </span>
                  {response ? (
                    <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sky-700">
                      {response.durationMs} ms
                    </span>
                  ) : null}
                </div>
              </div>

              {error ? (
                <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              ) : null}

              <div className="mt-4 grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)]">
                <div className="min-h-0">
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Response Headers
                  </label>
                  <textarea
                    className={`${editorClassName} min-h-[260px] lg:min-h-[360px]`}
                    placeholder="响应头会显示在这里"
                    readOnly
                    spellCheck={false}
                    value={responseHeaders}
                  />
                </div>

                <div className="min-h-0">
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Response Body
                  </label>
                  <textarea
                    className={`${editorClassName} min-h-[260px] lg:min-h-[360px]`}
                    placeholder="响应结果会显示在这里"
                    readOnly
                    spellCheck={false}
                    value={responseBody}
                  />
                </div>
              </div>
            </section>
          </form>
        </main>
      </div>
    </div>
  )
}

export default App
