import { invoke } from '@tauri-apps/api/core'
import type { FormEvent } from 'react'
import { useApiClientStore } from './store/useApiClientStore'
import type {
  BodyFormat,
  BodyMode,
  HttpMethod,
  KeyValueRow,
  RequestPanel,
  RequestPayload,
  ResponsePanel,
  ResponsePayload,
} from './types/api'

const methodOptions: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE']
const requestPanels: RequestPanel[] = ['params', 'headers', 'body', 'auth']
const responsePanels: ResponsePanel[] = ['body', 'cookies', 'headers']
const bodyFormats: BodyFormat[] = ['JSON', 'Text', 'XML']
const methodTextClassMap: Record<HttpMethod, string> = {
  GET: 'text-emerald-600',
  POST: 'text-amber-600',
  PUT: 'text-blue-600',
  DELETE: 'text-rose-600',
}
const methodSelectTextClassMap: Record<HttpMethod, string> = {
  GET: 'text-emerald-700',
  POST: 'text-amber-700',
  PUT: 'text-blue-700',
  DELETE: 'text-rose-700',
}
const methodOptionColorMap: Record<HttpMethod, string> = {
  GET: '#047857',
  POST: '#b45309',
  PUT: '#1d4ed8',
  DELETE: '#be123c',
}

const editorClassName =
  'h-full min-h-[220px] w-full resize-none rounded-md border border-slate-200 bg-[#fafafa] px-3 py-3 font-mono text-xs leading-6 text-slate-700 outline-none transition focus:border-sky-500'

function getMethodTextClass(method: HttpMethod) {
  return methodTextClassMap[method]
}

function getMethodSelectClass(method: HttpMethod) {
  return methodSelectTextClassMap[method]
}

function getMethodOptionStyle(method: HttpMethod) {
  return { color: methodOptionColorMap[method] }
}

function getStatusTextClass(status: number) {
  if (status >= 200 && status < 300) {
    return 'text-emerald-600'
  }

  if (status >= 300 && status < 400) {
    return 'text-amber-600'
  }

  return 'text-rose-600'
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

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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

function isBodySupported(method: HttpMethod) {
  return method !== 'GET'
}

function getRequestTitle(url: string) {
  const trimmed = url.trim()

  if (!trimmed) {
    return '未命名请求'
  }

  try {
    const parsedUrl = new URL(trimmed)
    const lastPathname = parsedUrl.pathname
      .split('/')
      .filter(Boolean)
      .at(-1)

    return lastPathname || parsedUrl.host || '未命名请求'
  } catch {
    const segments = trimmed.split('/').filter(Boolean)
    return segments.at(-1) || trimmed
  }
}

function hasRowValue(row: KeyValueRow) {
  return row.enabled || row.key.trim() || row.value.trim() || row.description.trim()
}

function collectEnabledEntries(rows: KeyValueRow[], label: string) {
  const entries: Array<[string, string]> = []

  for (const row of rows) {
    if (!hasRowValue(row) || !row.enabled) {
      continue
    }

    if (!row.key.trim()) {
      throw new Error(`${label} 中存在已启用但未填写 Key 的行。`)
    }

    entries.push([row.key.trim(), row.value])
  }

  return entries
}

function buildUrlWithParams(url: string, params: KeyValueRow[]) {
  const trimmedUrl = url.trim()

  if (!trimmedUrl) {
    return ''
  }

  const entries = collectEnabledEntries(params, 'Params')

  if (!entries.length) {
    return trimmedUrl
  }

  try {
    const parsedUrl = new URL(trimmedUrl)

    for (const [key, value] of entries) {
      parsedUrl.searchParams.set(key, value)
    }

    return parsedUrl.toString()
  } catch {
    const [base, query = ''] = trimmedUrl.split('?')
    const searchParams = new URLSearchParams(query)

    for (const [key, value] of entries) {
      searchParams.set(key, value)
    }

    const nextQuery = searchParams.toString()
    return nextQuery ? `${base}?${nextQuery}` : base
  }
}

function buildHeaders(
  rows: KeyValueRow[],
  method: HttpMethod,
  bodyMode: BodyMode,
  bodyFormat: BodyFormat,
) {
  const headers = Object.fromEntries(collectEnabledEntries(rows, 'Headers'))

  if (
    isBodySupported(method) &&
    bodyMode === 'raw' &&
    bodyFormat === 'JSON' &&
    !Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')
  ) {
    headers['Content-Type'] = 'application/json'
  }

  return headers
}

function validateBody(method: HttpMethod, bodyMode: BodyMode, bodyFormat: BodyFormat, bodyText: string) {
  if (!isBodySupported(method) || bodyMode === 'none' || !bodyText.trim()) {
    return
  }

  if (bodyFormat === 'JSON') {
    try {
      JSON.parse(bodyText)
    } catch {
      throw new Error('当前 Body 类型为 JSON，但内容不是合法 JSON。')
    }
  }
}

function getResponseTypeLabel(response: ResponsePayload | null) {
  if (!response) {
    return 'TEXT'
  }

  const contentTypeEntry = Object.entries(response.headers).find(
    ([key]) => key.toLowerCase() === 'content-type',
  )
  const contentType = contentTypeEntry?.[1]?.toLowerCase() ?? ''

  if (contentType.includes('json')) {
    return 'JSON'
  }

  if (contentType.includes('xml')) {
    return 'XML'
  }

  if (contentType.includes('html')) {
    return 'HTML'
  }

  return 'TEXT'
}

function getResponseSize(response: ResponsePayload | null) {
  if (!response) {
    return '0 B'
  }

  const encoder = new TextEncoder()
  let totalSize = encoder.encode(response.body).length

  for (const [key, value] of Object.entries(response.headers)) {
    totalSize += encoder.encode(`${key}:${value}`).length
  }

  return formatBytes(totalSize)
}

function getCookies(response: ResponsePayload | null) {
  if (!response) {
    return []
  }

  const cookieHeader = Object.entries(response.headers).find(
    ([key]) => key.toLowerCase() === 'set-cookie',
  )

  if (!cookieHeader) {
    return []
  }

  return cookieHeader[1]
    .split('\n')
    .map((cookie) => cookie.trim())
    .filter(Boolean)
}

interface KeyValueTableProps {
  rows: KeyValueRow[]
  keyPlaceholder: string
  valuePlaceholder: string
  onRowChange: (id: string, patch: Partial<KeyValueRow>) => void
}

function KeyValueTable({
  rows,
  keyPlaceholder,
  valuePlaceholder,
  onRowChange,
}: KeyValueTableProps) {
  return (
    <div className="overflow-auto rounded-md border border-slate-200 bg-white">
      <table className="min-w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-slate-200 text-xs text-slate-500">
            <th className="w-10 py-2 text-center font-normal" />
            <th className="w-1/3 px-2 py-2 font-normal">Key</th>
            <th className="w-1/3 px-2 py-2 font-normal">Value</th>
            <th className="w-1/3 px-2 py-2 font-normal">Description</th>
          </tr>
        </thead>
        <tbody className="font-mono text-xs text-slate-700">
          {rows.map((row) => (
            <tr className="border-b border-slate-100 hover:bg-slate-50" key={row.id}>
              <td className="text-center align-middle">
                <input
                  checked={row.enabled}
                  className="h-3.5 w-3.5 cursor-pointer rounded border-slate-300"
                  type="checkbox"
                  onChange={(event) =>
                    onRowChange(row.id, { enabled: event.currentTarget.checked })
                  }
                />
              </td>
              <td className="px-2 py-2 align-middle">
                <input
                  className="w-full border-none bg-transparent px-0 py-0 outline-none"
                  placeholder={keyPlaceholder}
                  spellCheck={false}
                  type="text"
                  value={row.key}
                  onChange={(event) =>
                    onRowChange(row.id, { key: event.currentTarget.value })
                  }
                />
              </td>
              <td className="px-2 py-2 align-middle">
                <input
                  className="w-full border-none bg-transparent px-0 py-0 outline-none"
                  placeholder={valuePlaceholder}
                  spellCheck={false}
                  type="text"
                  value={row.value}
                  onChange={(event) =>
                    onRowChange(row.id, { value: event.currentTarget.value })
                  }
                />
              </td>
              <td className="px-2 py-2 align-middle">
                <input
                  className="w-full border-none bg-transparent px-0 py-0 text-slate-500 outline-none"
                  placeholder="Description"
                  spellCheck={false}
                  type="text"
                  value={row.description}
                  onChange={(event) =>
                    onRowChange(row.id, { description: event.currentTarget.value })
                  }
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function App() {
  const {
    method,
    url,
    params,
    headers,
    requestPanel,
    responsePanel,
    bodyMode,
    bodyFormat,
    bodyText,
    loading,
    error,
    response,
    setMethod,
    setUrl,
    updateParamRow,
    updateHeaderRow,
    setRequestPanel,
    setResponsePanel,
    setBodyMode,
    setBodyFormat,
    setBodyText,
    startRequest,
    finishRequest,
    failRequest,
  } = useApiClientStore()

  const requestTitle = getRequestTitle(url)
  const responseBody = response ? formatMaybeJson(response.body) : ''
  const responseTypeLabel = getResponseTypeLabel(response)
  const responseHeaders = response ? Object.entries(response.headers) : []
  const cookies = getCookies(response)
  const paramsCount = params.filter(
    (row) => row.enabled && row.key.trim(),
  ).length
  const headersCount = headers.filter(
    (row) => row.enabled && row.key.trim(),
  ).length

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    try {
      if (!url.trim()) {
        throw new Error('请输入请求 URL。')
      }

      validateBody(method, bodyMode, bodyFormat, bodyText)

      const request: RequestPayload = {
        method,
        url: buildUrlWithParams(url, params),
        headers: buildHeaders(headers, method, bodyMode, bodyFormat),
        body:
          isBodySupported(method) && bodyMode === 'raw'
            ? bodyText
            : null,
      }

      setResponsePanel('body')
      startRequest()

      const result = await invoke<ResponsePayload>('send_request', { request })
      finishRequest(result)
    } catch (submitError) {
      failRequest(getErrorMessage(submitError))
    }
  }

  async function handleCopyResponse() {
    if (!responseBody || !navigator.clipboard) {
      return
    }

    await navigator.clipboard.writeText(responseBody)
  }

  return (
    <div className="flex h-screen overflow-hidden bg-white text-sm text-slate-800">
      <aside className="flex w-64 flex-shrink-0 flex-col border-r border-slate-200 bg-[#f9fafb]">
        <div className="flex h-12 items-center justify-between border-b border-slate-200 bg-white px-4">
          <span className="font-semibold text-slate-700">我的工作空间</span>
          <button
            className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            type="button"
          >
            +
          </button>
        </div>

        <div className="border-b border-slate-200 p-3">
          <input
            className="w-full rounded-md border border-transparent bg-slate-100 px-3 py-1.5 text-xs outline-none transition focus:border-sky-500 focus:bg-white"
            disabled
            placeholder="搜索接口..."
            type="text"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          <div className="mb-1 rounded-md px-2 py-1.5 text-slate-700">
            <div className="flex items-center gap-2 font-medium">
              <span className="text-slate-400">v</span>
              <span>用户管理 (User API)</span>
            </div>
            <div className="mt-1 space-y-0.5 pl-6">
              <div className="flex items-center gap-2 rounded bg-sky-50 px-2 py-1.5 text-sky-700">
                <span className="w-8 text-[10px] font-bold text-emerald-600">GET</span>
                <span className="truncate">获取用户信息</span>
              </div>
              <div className="flex items-center gap-2 rounded px-2 py-1.5 text-slate-500">
                <span className="w-8 text-[10px] font-bold text-amber-600">POST</span>
                <span className="truncate">创建新用户</span>
              </div>
            </div>
          </div>

          <div className="mb-1 rounded-md px-2 py-1.5 text-slate-500">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">{'>'}</span>
              <span>订单系统 (Order API)</span>
            </div>
          </div>

          <div className="mt-6 rounded-lg border border-dashed border-slate-200 bg-white p-3 text-xs leading-5 text-slate-400">
            左侧目录当前为占位区，后续再接入集合、历史记录和搜索。
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col bg-white">
        <div className="flex h-10 gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50/50 px-2 pt-1.5">
          <div className="relative z-10 flex min-w-[180px] items-center gap-2 rounded-t-md border border-b-0 border-slate-200 bg-white px-3 py-1.5">
            <span className={`text-[10px] font-bold ${getMethodTextClass(method)}`}>
              {method}
            </span>
            <span className="truncate text-slate-700">{requestTitle}</span>
            <button className="ml-auto text-slate-300" type="button">
              x
            </button>
          </div>
          <div className="flex min-w-[150px] items-center gap-2 rounded-t-md px-3 py-1.5 text-slate-400">
            <span className="text-[10px] font-bold text-slate-300">MVP</span>
            <span className="truncate">右侧工作区</span>
          </div>
        </div>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
          <div className="flex gap-2 border-b border-slate-200 bg-white p-3">
            <div className="flex flex-1 overflow-hidden rounded-md border border-slate-300 bg-slate-50 transition focus-within:border-sky-500 focus-within:ring-1 focus-within:ring-sky-500">
              <label className="sr-only" htmlFor="method">
                HTTP Method
              </label>
              <select
                className={`border-r border-slate-300 bg-slate-50 pl-3 pr-8 py-2 text-sm font-semibold outline-none ${getMethodSelectClass(method)}`}
                id="method"
                value={method}
                onChange={(event) =>
                  setMethod(event.currentTarget.value as HttpMethod)
                }
              >
                {methodOptions.map((option) => (
                  <option
                    key={option}
                    value={option}
                    style={getMethodOptionStyle(option)}
                  >
                    {option}
                  </option>
                ))}
              </select>

              <label className="sr-only" htmlFor="url">
                Request URL
              </label>
              <input
                className="min-w-0 flex-1 bg-white px-3 py-2 font-mono text-sm text-slate-700 outline-none"
                id="url"
                placeholder="https://api.example.com/v1/users/{id}"
                spellCheck={false}
                type="text"
                value={url}
                onChange={(event) => setUrl(event.currentTarget.value)}
              />
            </div>

            <button
              className="min-w-[104px] rounded-md bg-sky-600 px-6 py-2 font-medium text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={loading}
              type="submit"
            >
              {loading ? '发送中...' : '发送'}
            </button>
          </div>

          <div className="grid min-h-0 flex-1 grid-rows-[minmax(260px,1fr)_minmax(280px,1fr)] overflow-hidden">
            <section className="flex min-h-0 flex-col border-b border-slate-200">
              <div className="flex gap-6 border-b border-slate-200 px-5 pt-2 text-slate-500">
                {requestPanels.map((panel) => {
                  const isActive = requestPanel === panel
                  const label =
                    panel === 'params'
                      ? 'Params'
                      : panel === 'headers'
                        ? 'Headers'
                        : panel === 'body'
                          ? 'Body'
                          : 'Auth'
                  const count =
                    panel === 'params'
                      ? paramsCount
                      : panel === 'headers'
                        ? headersCount
                        : null

                  return (
                    <button
                      className={`pb-2.5 transition-colors ${
                        isActive
                          ? 'border-b-2 border-sky-500 font-medium text-sky-600'
                          : 'border-b-2 border-transparent hover:text-slate-800'
                      }`}
                      key={panel}
                      type="button"
                      onClick={() => setRequestPanel(panel)}
                    >
                      {label}
                      {count ? (
                        <span className="ml-1 text-xs text-slate-400">
                          ({count})
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>

              <div className="min-h-0 flex-1 overflow-auto bg-white p-4">
                {requestPanel === 'params' ? (
                  <KeyValueTable
                    keyPlaceholder="name"
                    rows={params}
                    valuePlaceholder="value"
                    onRowChange={updateParamRow}
                  />
                ) : null}

                {requestPanel === 'headers' ? (
                  <KeyValueTable
                    keyPlaceholder="Header"
                    rows={headers}
                    valuePlaceholder="Value"
                    onRowChange={updateHeaderRow}
                  />
                ) : null}

                {requestPanel === 'body' ? (
                  <div className="flex h-full flex-col">
                    <div className="mb-3 flex flex-wrap items-center gap-4 text-sm text-slate-600">
                      {(['none', 'raw'] as BodyMode[]).map((option) => (
                        <label className="flex items-center gap-1.5" key={option}>
                          <input
                            checked={bodyMode === option}
                            className="cursor-pointer"
                            name="body-mode"
                            type="radio"
                            onChange={() => setBodyMode(option)}
                          />
                          {option}
                        </label>
                      ))}

                      <span className="cursor-not-allowed text-slate-300">
                        form-data
                      </span>
                      <span className="cursor-not-allowed text-slate-300">
                        x-www-form-urlencoded
                      </span>

                      <select
                        className="ml-2 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-sky-700 outline-none disabled:text-slate-300"
                        disabled={bodyMode !== 'raw'}
                        value={bodyFormat}
                        onChange={(event) =>
                          setBodyFormat(event.currentTarget.value as BodyFormat)
                        }
                      >
                        {bodyFormats.map((format) => (
                          <option key={format} value={format}>
                            {format}
                          </option>
                        ))}
                      </select>
                    </div>

                    <textarea
                      className={`${editorClassName} ${
                        bodyMode === 'none' || !isBodySupported(method)
                          ? 'cursor-not-allowed bg-slate-100 text-slate-400'
                          : ''
                      }`}
                      disabled={bodyMode === 'none' || !isBodySupported(method)}
                      placeholder={`{\n  "userId": "10023"\n}`}
                      spellCheck={false}
                      value={bodyText}
                      onChange={(event) => setBodyText(event.currentTarget.value)}
                    />

                    <p className="mt-2 text-xs text-slate-400">
                      {isBodySupported(method)
                        ? bodyMode === 'raw'
                          ? '当前发送原始 Body，JSON 模式下会在发送前做格式校验。'
                          : '当前请求不会附带 Body。'
                        : 'GET 请求不会发送 Body。'}
                    </p>
                  </div>
                ) : null}

                {requestPanel === 'auth' ? (
                  <div className="flex h-full min-h-[220px] items-center justify-center rounded-md border border-dashed border-slate-200 text-slate-400">
                    MVP 阶段先占位，认证配置后续补充。
                  </div>
                ) : null}
              </div>
            </section>

            <section className="relative flex min-h-0 flex-col bg-[#fdfdfd]">
              <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 pt-1">
                <div className="flex gap-6 pt-1 text-slate-500">
                  {responsePanels.map((panel) => {
                    const isActive = responsePanel === panel
                    const label =
                      panel === 'body'
                        ? 'Body'
                        : panel === 'cookies'
                          ? 'Cookies'
                          : 'Headers'
                    const count =
                      panel === 'headers'
                        ? responseHeaders.length
                        : panel === 'cookies'
                          ? cookies.length
                          : null

                    return (
                      <button
                        className={`pb-2.5 transition-colors ${
                          isActive
                            ? 'border-b-2 border-sky-500 font-medium text-sky-600'
                            : 'border-b-2 border-transparent hover:text-slate-800'
                        }`}
                        key={panel}
                        type="button"
                        onClick={() => setResponsePanel(panel)}
                      >
                        {label}
                        {count ? (
                          <span className="ml-1 text-xs text-slate-400">
                            ({count})
                          </span>
                        ) : null}
                      </button>
                    )
                  })}
                </div>

                {response && !loading && !error ? (
                  <div className="flex gap-4 pb-1 font-mono text-xs">
                    <div className="flex items-center gap-1">
                      <span className="text-slate-400">Status:</span>
                      <span className={`font-bold ${getStatusTextClass(response.status)}`}>
                        {`${response.status} ${response.statusText}`.trim()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-slate-400">Time:</span>
                      <span className="font-bold text-emerald-600">
                        {response.durationMs} ms
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-slate-400">Size:</span>
                      <span className="font-bold text-emerald-600">
                        {getResponseSize(response)}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="relative min-h-0 flex-1 overflow-auto bg-slate-50/50 p-4">
                {!loading && !response && !error ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center text-slate-400">
                    <div className="mb-3 text-4xl text-slate-300">Send</div>
                    <p>输入 URL 并点击发送获取响应结果。</p>
                  </div>
                ) : null}

                {loading ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
                    <div className="mb-3 h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-sky-500" />
                    <p>正在发送请求...</p>
                  </div>
                ) : null}

                {error ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error}
                  </div>
                ) : null}

                {response && !loading && !error ? (
                  <div className="h-full">
                    {responsePanel === 'body' ? (
                      <div className="flex h-full flex-col">
                        <div className="mb-2 flex items-center gap-2">
                          <span className="rounded bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                            {responseTypeLabel}
                          </span>
                          <button
                            className="ml-auto rounded px-2 py-1 text-xs text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
                            type="button"
                            onClick={() => {
                              void handleCopyResponse()
                            }}
                          >
                            复制
                          </button>
                        </div>

                        <pre className="min-h-0 flex-1 overflow-auto rounded-md border border-slate-200 bg-white p-4 font-mono text-[13px] leading-6 text-slate-700">
                          {responseBody || '(empty body)'}
                        </pre>
                      </div>
                    ) : null}

                    {responsePanel === 'headers' ? (
                      <div className="overflow-auto rounded-md border border-slate-200 bg-white">
                        <table className="min-w-full border-collapse text-left">
                          <thead>
                            <tr className="border-b border-slate-200 text-xs text-slate-500">
                              <th className="w-1/3 px-3 py-2 font-normal">Header</th>
                              <th className="px-3 py-2 font-normal">Value</th>
                            </tr>
                          </thead>
                          <tbody className="font-mono text-xs text-slate-700">
                            {responseHeaders.length ? (
                              responseHeaders.map(([key, value]) => (
                                <tr
                                  className="border-b border-slate-100 align-top"
                                  key={key}
                                >
                                  <td className="px-3 py-2 font-semibold">{key}</td>
                                  <td className="whitespace-pre-wrap px-3 py-2">
                                    {value}
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td className="px-3 py-6 text-slate-400" colSpan={2}>
                                  没有可展示的响应头。
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    ) : null}

                    {responsePanel === 'cookies' ? (
                      cookies.length ? (
                        <div className="overflow-auto rounded-md border border-slate-200 bg-white p-4 font-mono text-xs leading-6 text-slate-700">
                          {cookies.map((cookie) => (
                            <div className="border-b border-slate-100 py-2" key={cookie}>
                              {cookie}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex h-full min-h-[220px] items-center justify-center rounded-md border border-dashed border-slate-200 text-slate-400">
                          当前响应没有返回 Cookies。
                        </div>
                      )
                    ) : null}
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        </form>
      </main>
    </div>
  )
}

export default App
