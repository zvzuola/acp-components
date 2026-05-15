# acp-components

[English](README.md)

基于 [Agent Client Protocol (ACP)](https://github.com/agentclientprotocol/agent-client-protocol) 协议的通用前端组件库，用于快速搭建 AI Agent 交互界面。项目采用**数据层与 UI 层分离**的架构设计：

- **`@acp-components/core`** — 框架无关的纯 TypeScript 模块：传输通信、状态管理、业务逻辑
- **`@acp-components/react`** — React 组件库：界面渲染与用户交互

开发者可以只使用数据层，配合 Vue、Svelte 等其他前端框架搭建自己的 UI 组件库。

## 特性

- **框架无关核心** — Zustand vanilla stores，零 React 依赖；支持 Vue、Svelte、Solid 或纯 JS
- **多传输协议** — 开箱即用支持 Stdio、HTTP、WebSocket 及自定义传输；附带 Tauri IPC 传输示例
- **丰富的 UI 组件** — 会话列表、聊天视图（回合分组）、Diff 视图、终端视图、权限弹窗、计划视图、思考视图、命令面板等 15+ 组件
- **流式交互体验** — 实时内容与思考过程流式展示，动画指示器，工具调用状态跟踪，Token 用量统计
- **会话管理** — 完整 CRUD：创建、加载、切换、关闭会话，支持会话配置项
- **工具调用可视化** — 追踪 Agent 工具调用，展示状态、输入/输出、文件定位和差异对比
- **权限处理** — 基于 Promise 的权限流程，内置模态弹窗用于批准或拒绝工具调用请求
- **主题系统** — 通过 CSS 自定义属性（`--acp-*` 设计令牌）提供暗色/亮色主题；通过 `data-acp-theme` 属性可扩展自定义主题
- **国际化** — 内置 i18n 支持（英文、中文），基于 i18next，支持自定义语言扩展
- **桌面端就绪** — 包含 Tauri 和 stdio 传输示例，可直接用于原生桌面应用开发

## 效果截图

### Web 演示

![ACP Web Demo](assets/screenshot-web.png)

### Tauri 桌面应用

![ACP Tauri Desktop](assets/screenshot-tauri.png)

## 包结构

| 包 | 说明 |
|---------|-------------|
| [@acp-components/core](packages/core) | 框架无关：传输层、AcpClient、vanilla Zustand stores、命令式 actions |
| [@acp-components/react](packages/react) | React 绑定：Context Provider、Hooks（useSyncExternalStore）、15+ UI 组件 |

## 安装

```bash
pnpm add @acp-components/core @acp-components/react
```

**Peer 依赖**：`react`（^18 \|\| ^19）、`react-dom`（^18 \|\| ^19）

## 快速开始

```tsx
import ReactDOM from 'react-dom/client';
import {
  I18nProvider,
  AcpProvider,
  Workbench,
  SessionList,
  ChatView,
  PermissionDialog,
} from '@acp-components/react';
import { useAcpStore, useSessions } from '@acp-components/react';

function App() {
  const activeSessionId = useAcpStore((s) => s.activeSessionId);

  return (
    <I18nProvider>
      <AcpProvider
        transport={{
          type: 'websocket',
          url: 'ws://127.0.0.1:3100',
        }}
        theme="dark"
      >
        <Workbench
          sidebar={<SessionList />}
          main={<ChatView sessionId={activeSessionId} />}
        />
        <PermissionDialog sessionId={activeSessionId} />
      </AcpProvider>
    </I18nProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
```

## 传输方式

```tsx
// Stdio — 直接启动 Agent 子进程（Electron / Tauri / Node.js 桌面应用）
<AcpProvider transport={{
  type: 'stdio',
  command: 'opencode',
  args: ['acp'],
}}>

// HTTP — 通过 HTTP POST 连接
<AcpProvider transport={{
  type: 'http',
  url: 'http://localhost:8080/acp',
  headers: { 'Authorization': 'Bearer token' },
}}>

// WebSocket — 连接到桥接服务器（浏览器环境）
<AcpProvider transport={{
  type: 'websocket',
  url: 'ws://127.0.0.1:3100',
}}>

// 自定义 — 提供自定义 AcpTransport 实现
<AcpProvider transport={{
  type: 'custom',
  transport: myCustomTransport,
}}>
```

## 组件

| 组件 | 功能说明 |
|-----------|-------------|
| `AcpProvider` | 顶层 Provider：管理连接生命周期，将会话更新分发到 stores，连接未就绪时显示加载动画。Props: `transport`, `clientInfo`, `clientCapabilities`, `theme`, `defaultCwd`, `onFileRead`, `onFileWrite` |
| `Workbench` | 三栏布局容器（sidebar / main / panel），使用 CSS Grid |
| `ProjectOpener` | 可编辑的项目目录显示，带浏览按钮 |
| `SessionList` | 侧边栏会话列表，支持创建 / 选择 / 删除操作 |
| `ChatView` | 主聊天区域：按用户/Agent 分组消息，显示计划、用量条和配置面板。Props: `sessionId`, `onNavigateFile` |
| `MessageBubble` | 消息气泡渲染：按顺序渲染内容块、思考块、工具调用，通过 `marked` 渲染 Markdown |
| `ChatComposer` | 消息输入框，集成斜杠命令面板，支持发送 / 取消操作 |
| `StreamingIndicator` | Agent 流式输出时的动画指示器 |
| `ToolCallCard` | 工具调用状态卡片：展示调用名称、状态、输入/输出、文件位置 |
| `ThoughtView` | 可折叠的 Agent 思考/推理内容视图 |
| `PlanView` | 流式输出时展示 Agent 计划条目 |
| `DiffView` | 文件变更的并排对比视图 |
| `PermissionDialog` | 权限请求模态弹窗：批准或拒绝工具调用 |
| `TerminalView` | 终端输出嵌入显示 |
| `ConnectionStatus` | 连接状态指示器，含 Agent 名称和版本 |
| `UsageBar` | Token 用量进度条，显示上下文窗口消耗 |
| `SessionConfigPanel` | 会话配置选项下拉菜单 |
| `CommandPalette` | 斜杠命令面板，展示可选 Agent 命令 |

## Hooks

| Hook | 说明 |
|------|-------------|
| `useAcpProvider(opts)` | 创建并管理 ACP Provider 生命周期（connect → initialize → ready） |
| `useAcpStore(selector)` | 订阅全局 `acpStore`（基于 `useSyncExternalStore` 的 Zustand vanilla store） |
| `useSessionStore(sessionId, selector)` | 订阅指定会话的 `sessionStore` |
| `useSessions()` | 会话 CRUD：列表、创建、选择、关闭、刷新，以及 `activeSessionId` |
| `useSession(sessionId)` | 单个会话的完整数据：消息、流式状态、工具调用、权限、计划、用量、配置项、可用命令 |
| `usePrompt(sessionId)` | `send(blocks)` 和 `cancel()` 用于发送 / 取消消息 |
| `useToolCalls(sessionId)` | 会话中待处理和已完成的工具调用 |
| `usePermission(sessionId)` | 当前权限请求及其 `respond(optionId)` 和 `deny()` 操作 |
| `useConnectionStatus()` | 连接状态及 Agent 信息（名称、版本） |
| `useAcpContext()` | 从 React Context 中获取 `AcpClient`、配置和 `projectCwd` |
| `useI18n()` | 获取 `t()` 翻译函数和 `i18n` 实例 |

## 架构设计

### 分层架构

```
┌──────────────────────────────────────────────────────┐
│               应用层 (Application)                     │
│  Vite Demo / Tauri Desktop / 自定义应用                │
└────────────────────┬─────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────┐
│          UI 层: @acp-components/react                  │
│  ┌────────────────────────────────────────────────┐  │
│  │  组件层 (15+)                                   │  │
│  │  Workbench  ChatView  SessionList  DiffView    │  │
│  │  PermissionDialog  CommandPalette  ...         │  │
│  ├────────────────────────────────────────────────┤  │
│  │  Hooks 层 (useSyncExternalStore)               │  │
│  │  useAcpStore  useSession  usePrompt  ...       │  │
│  ├────────────────────────────────────────────────┤  │
│  │  AcpContext + I18nProvider                     │  │
│  ├────────────────────────────────────────────────┤  │
│  │  主题系统 (CSS 自定义属性)                       │  │
│  │  --acp-color-*  --acp-shadow-*  --acp-radius-*│  │
│  └────────────────────────────────────────────────┘  │
└────────────────────┬─────────────────────────────────┘
                     │  依赖
┌────────────────────▼─────────────────────────────────┐
│        数据层: @acp-components/core (框架无关)          │
│  ┌────────────────────────────────────────────────┐  │
│  │  AcpClient                                     │  │
│  │  connect / initialize / prompt / cancel         │  │
│  │  会话 CRUD / setSessionConfigOption             │  │
│  │  onSessionUpdate / setPermissionHandler         │  │
│  ├────────────────────────────────────────────────┤  │
│  │  传输层 (Transport Layer)                       │  │
│  │  StdioTransport │ HttpTransport                 │  │
│  │  WebSocketTransport │ Custom (AcpTransport)     │  │
│  ├────────────────────────────────────────────────┤  │
│  │  状态管理 (vanilla Zustand)                     │  │
│  │  acpStore — 全局状态                            │  │
│  │  sessionStore — 会话级状态                       │  │
│  ├────────────────────────────────────────────────┤  │
│  │  业务逻辑 Actions (命令式)                       │  │
│  │  sessions / prompt / permission                │  │
│  ├────────────────────────────────────────────────┤  │
│  │  createAcpProvider() — 生命周期编排器            │  │
│  │  连接 transport → AcpClient → stores            │  │
│  └────────────────────────────────────────────────┘  │
└────────────────────┬─────────────────────────────────┘
                     │  基于
┌────────────────────▼─────────────────────────────────┐
│       @agentclientprotocol/sdk  (ACP 协议层)          │
│  ClientSideConnection / NDJSON 流 / 协议握手          │
└──────────────────────────────────────────────────────┘
```

### 数据流

ACP 协议支持 Client 与 Agent 之间的双向通信。前端内部采用单向循环模式管理状态：

```
Agent 推送 (sessionUpdate)
    ↓ NDJSON 流 → Transport.readable
AcpClient.onSessionUpdate 事件
    ↓
createAcpProvider 分发到 stores
    ↓
acpStore / sessionStore (Zustand vanilla)
    ↓ useSyncExternalStore
React Hooks → 组件 (re-render)
    ↓ 用户操作
Actions (操作 client + stores)
    ↓ ACP 协议消息
AcpClient.prompt() / cancel() → Transport.writable → Agent
```

**SessionUpdate 分发映射：**

| SessionUpdate 类型 | Store Action |
|---|---|
| `agent_message_chunk` | `sessionStore.appendContent()` |
| `user_message_chunk` | `sessionStore.appendContent()` |
| `agent_thought_chunk` | `sessionStore.appendThought()` |
| `tool_call` | `sessionStore.upsertToolCall()` |
| `tool_call_update` | `sessionStore.updateToolCall()` |
| `plan` | `sessionStore.setPlan()` |
| `usage_update` | `sessionStore.setUsage()` |
| `config_option_update` | `sessionStore.setConfigOptions()` |
| `available_commands_update` | `sessionStore.setAvailableCommands()` |
| `session_info_update` | `acpStore.updateSession()` |

### 状态管理

两个全局单例 vanilla Zustand store（无 React 依赖）：

- **`acpStore`** — 全局状态：`connectionStatus`、`agentInfo`、`capabilities`、`sessions`（Map）、`activeSessionId`、`projectCwd`
- **`sessionStore`** — 按 `SessionId` 索引的会话数据：`messages[]`、`isStreaming`、`pendingToolCalls`（Map）、`stopReason`、`pendingPermissions[]`、`plan[]`、`usage`、`configOptions[]`、`availableCommands[]`

### 权限流程

Provider 将 ACP 的回调式权限请求封装为 Promise，存储在 store 中供 UI 消费：

```
Agent → requestPermission(params)
    ↓
AcpClient.permissionHandler = () => new Promise(...)
    ↓
sessionStore.addPermissionRequest(sessionId, req)
    ↓
PermissionDialog 展示权限请求
    ↓
用户点击允许 → respondToPermission(id, optionId)
    │     └→ req.resolve(optionId) → Promise 完成
用户点击拒绝 → denyPermission(id)
          └→ req.reject() → Promise 完成
```

## 主题系统

组件库使用 CSS 自定义属性作为设计令牌契约，所有组件样式只引用 `--acp-*` 变量，不硬编码颜色值。

通过 `data-acp-theme` 属性切换两种内置主题：

- `"dark"` — "Warp" 暗色主题（默认）：深蓝黑底 + 青色电光强调
- `"light"` — "Frost" 亮色主题：冷白蓝灰表面 + 青色强调

通过覆盖变量创建自定义主题：

```css
[data-acp-theme='my-theme'] {
  --acp-color-bg-primary: #ffffff;
  --acp-color-accent: #ff6b6b;
  /* 覆盖所需的所有变量... */
}
```

```tsx
<AcpProvider theme="my-theme" transport={...}>
```

## 国际化 (i18n)

内置 i18next 国际化支持，语言自动检测（`localStorage` → `navigator.language` → `defaultLocale`）。

```tsx
import { I18nProvider } from '@acp-components/react';

<I18nProvider
  defaultLocale="zh-CN"
  customLocales={{
    'ja-JP': {
      'composer.placeholder': 'メッセージを入力...',
      'permission.title': '権限が必要です',
    },
  }}
>
  <App />
</I18nProvider>
```

使用 `useI18n()` Hook 切换语言：

```tsx
const { t, i18n } = useI18n();
i18n.changeLanguage('zh-CN'); // 切换到中文
```

## 跨框架使用

`@acp-components/core` 完全不依赖 React，可在任何框架中使用：

```ts
import { acpStore, sessionStore, createAcpProvider, sendPrompt } from '@acp-components/core';

// 1. 创建 Provider
const provider = createAcpProvider({
  transport: { type: 'stdio', command: 'opencode', args: ['acp'] },
});

// 2. 等待就绪
provider.subscribe(() => {
  if (provider.ready) {
    console.log('已连接!');
  }
});

// 3. 读取 vanilla stores
acpStore.getState().sessions;       // 当前会话列表
acpStore.subscribe((state) => { }); // 监听状态变化

// 4. 使用 actions
await sendPrompt(provider.client, sessionId, blocks);
```

## 工程结构

```
acp-components/
├── packages/
│   ├── core/                    # @acp-components/core (框架无关)
│   │   └── src/
│   │       ├── client/          # AcpClient — 封装 ACP ClientSideConnection
│   │       ├── transport/       # StdioTransport、HttpTransport、WebSocketTransport
│   │       ├── store/           # acpStore、sessionStore (vanilla Zustand)
│   │       ├── actions/         # sessions.ts、prompt.ts、permission.ts
│   │       ├── types/           # 共享 TypeScript 类型定义
│   │       ├── provider.ts      # createAcpProvider() 工厂函数
│   │       └── index.ts
│   └── react/                   # @acp-components/react (React UI)
│       └── src/
│           ├── components/
│           │   ├── workbench/    # AcpProvider、Workbench、ProjectOpener
│           │   ├── chat-view/    # ChatView、MessageBubble、ChatComposer、
│           │   │                  ToolCallCard、StreamingIndicator、ThoughtView、PlanView
│           │   ├── session-list/
│           │   ├── session-config-panel/
│           │   ├── diff-view/
│           │   ├── terminal-view/
│           │   ├── permission-dialog/
│           │   ├── status-bar/   # ConnectionStatus、UsageBar
│           │   └── command-palette/
│           ├── hooks/            # useAcpProvider、useAcpStore、useSessionStore、
│           │                      useSessions、useSession、usePrompt、
│           │                      useToolCalls、usePermission、useConnectionStatus
│           ├── context/          # AcpContext
│           ├── i18n/             # I18nProvider、useI18n、en-US / zh-CN 语言包
│           ├── styles/           # themes.scss、styles.css
│           └── index.ts
├── examples/
│   ├── demo/                    # Vite 浏览器 Demo（WebSocket 传输）
│   ├── server/                  # WebSocket ↔ stdio 桥接服务器
│   └── tauri/                   # Tauri 桌面应用（自定义 TauriIpcTransport）
├── package.json                 # 根工作空间配置
├── pnpm-workspace.yaml
└── tsconfig.json
```

## 开发指南

### 环境要求

- Node.js >= 18
- pnpm
- 一个兼容 ACP 协议的 Agent（如 [opencode](https://github.com/anthropics/opencode) 的 `acp` 子命令）

### 初始化

```bash
# 安装依赖
pnpm install

# 构建全部包
pnpm build

# 单独构建
pnpm build:core
pnpm build:react

# 运行测试
pnpm test
```

### Web Demo

```bash
# 终端 1 — 启动桥接服务器（WebSocket ↔ stdio 代理）
pnpm dev:server

# 终端 2 — 启动 Vite 开发服务器
pnpm dev
```

Demo 将运行在 `http://localhost:5173`。

### Tauri 桌面应用

```bash
pnpm dev:tauri      # 开发模式
pnpm build:tauri    # 生产构建
```

### 桥接服务器配置

| 环境变量 | 默认值 | 说明 |
|----------|---------|-------------|
| `ACP_PORT` | `3100` | WebSocket 服务器端口 |
| `ACP_HOST` | `127.0.0.1` | WebSocket 服务器地址 |
| `ACP_AGENT` | `opencode` | 要启动的 Agent 命令 |
| `ACP_AGENT_ARGS` | `acp` | 传递给 Agent 的参数 |

## 扩展性

### 自定义传输

实现 `AcpTransport` 接口即可添加任意通信层：

```ts
import type { AcpTransport, Stream } from '@acp-components/core';

class MyCustomTransport implements AcpTransport {
  async connect(): Promise<Stream> { /* ... */ }
  disconnect(): void { /* ... */ }
  onClose?: (handler: () => void) => () => void;
  onError?: (handler: (err: Error) => void) => () => void;
}

<AcpProvider transport={{ type: 'custom', transport: new MyCustomTransport() }}>
```

实际案例：Tauri IPC、Electron IPC、Chrome Extension 消息传递、iframe postMessage 等。

### 文件系统集成

通过回调控制 Agent 如何读写文件：

```tsx
<AcpProvider
  transport={...}
  onFileRead={async (req) => {
    const content = await nativeFs.readTextFile(req.path);
    return { content };
  }}
  onFileWrite={async (req) => {
    await nativeFs.writeTextFile(req.path, req.content);
    return {};
  }}
>
```

## 技术栈

| 层级 | 技术选型 |
|-------|-----------|
| 协议层 | `@agentclientprotocol/sdk`（ACP 协议 TypeScript SDK） |
| 状态管理 | Zustand v5（vanilla store，无 React 依赖） |
| UI 框架 | React 18 / 19 |
| 国际化 | i18next + react-i18next |
| Markdown 渲染 | marked |
| 样式方案 | SCSS Modules + CSS 自定义属性 |
| 构建工具 | Vite 6（库模式） |
| 类型系统 | TypeScript 5.6（strict mode） |
| 测试框架 | Vitest + @testing-library/react + jsdom |
| 包管理 | pnpm（workspace monorepo） |

## License

MIT
