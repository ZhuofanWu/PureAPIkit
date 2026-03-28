# PureAPIkit

一个严格最小的本地 API 调试桌面应用，技术栈为 Tauri v2 + React 18 + TypeScript + Vite。

当前只保留这些能力：

- `GET / POST`
- URL 输入
- Headers JSON 定义框
- Body 原文输入框
- 响应状态、响应头、响应体展示

真实网络请求由 Rust `reqwest` 发送，前端不会直接使用 `fetch` 或 `axios`。

## 开发

```bash
corepack pnpm install
corepack pnpm tauri dev
```

## 构建

```bash
corepack pnpm tauri build
```
