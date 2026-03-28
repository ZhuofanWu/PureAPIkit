
# Local API Client Project Guide

## 项目概述
本项目是一个轻量级、纯本地的 API 接口调试桌面工具。为了彻底杜绝类似 APIFox 等工具的供应链投毒与 RCE 漏洞，本项目采用极度严格的安全隔离架构，拒绝引入任何不必要的远程依赖或危险的执行环境。

## 核心技术栈
- **Desktop/Backend**: Tauri V2 (Rust)
- **Frontend**: React 18 + TypeScript + Vite
- **UI Framework**: Tailwind CSS + Shadcn UI + Lucide Icons
- **Editor**: `@monaco-editor/react`
- **State Management**: Zustand
- **Local Storage**: `@tauri-apps/plugin-store`
- **HTTP Client**: Rust `reqwest` (通过 Tauri IPC 调用)

## 🚀 常用开发命令
- 安装依赖: `pnpm install`
- 启动本地开发 (前端+Rust): `pnpm tauri dev`
- 构建生产版本: `pnpm tauri build`
- 添加 Shadcn 组件: `pnpm dlx shadcn-ui@latest add <component-name>`
- 检查代码规范: `pnpm lint`

## 🛡️ 核心安全与架构规范 (CRITICAL)

### 1. 网络请求架构 (Bypassing CORS Safely)
- **绝对禁止**在 React 前端使用 `fetch` 或 `axios` 发送真实的 API 测试请求，否则会触发浏览器的 CORS 限制。
- **必须**在 Rust 端 (`src-tauri/src/main.rs`) 使用 `reqwest` 编写一个 `invoke` 命令，例如 `send_request`。
- 前端只负责将 URL、Headers、Body 通过 `@tauri-apps/api/core` 的 `invoke` 传递给 Rust，由 Rust 执行请求并将响应（Status, Headers, Body, Time）返回给前端。

### 2. 纯本地原则与反投毒 (Anti-Supply-Chain-Attack)
- **零外部资源**：前端 HTML 文件中禁止使用任何 `<script src="http...">` 或 `<link href="http...">` 引入外部 CDN 资源。所有依赖必须通过 npm 安装并在本地打包。
- **严格 IPC**：前端与系统的交互只能通过预定义的 Tauri IPC (`invoke`) 进行。不要开启任何不必要的 Tauri 权限。
- **禁止危险执行**：项目中严禁使用 `eval()`、`new Function()` 或任何动态执行不受信任 JavaScript 代码的机制。如果未来需要支持“前置/后置脚本”，必须使用隔离的纯净 Web Worker 或在 Rust 端使用嵌入式 JS 引擎（如 `boa`）执行。

### 3. 代码风格与状态管理
- React 组件一律使用 Functional Component 和 Hooks。
- 使用 `Zustand` 管理全局状态，例如“当前打开的 Tab 页”、“已保存的 API 历史记录”。
- 所有的 API 请求配置（URL、Method、Headers 等）应当定义清晰的 TypeScript Interface。
- UI 交互应当尽量向现代 IDE (如 VS Code) 靠拢，利用 Shadcn UI 的 `ResizablePanel` 实现侧边栏（历史记录/合集）与主工作区（请求区、响应区）的拖拽分割。

### 4. 存储规范
- 不要使用浏览器的 `localStorage` 或 `IndexedDB`，容易因为清除浏览器数据而丢失。
- 使用 `@tauri-apps/plugin-store` 将用户的请求历史和配置以 JSON 格式持久化在系统特定的 AppData 目录中。
