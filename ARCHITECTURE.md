# acp-components 架构设计文档

## 1. 项目概述

### 1.1 项目定位

`acp-components` 是一套基于 [Agent Client Protocol (ACP)](https://github.com/agentclientprotocol/sdk) 协议的通用前端组件库，用于快速搭建 AI Agent 交互界面。项目采用**数据层与 UI 层分离**的架构设计：

- **数据层 (`@acp-components/core`)**：框架无关的纯 TypeScript 模块，负责传输通信、状态管理、业务逻辑
- **UI 层 (`@acp-components/react`)**：React 组件库，负责界面渲染与用户交互

开发者可以只使用数据层，配合 Vue、Svelte 等其他前端框架搭建自己的 UI 组件库。

### 1.2 技术栈

| 层级 | 技术选型 |
|------|---------|
| 协议层 | `@agentclientprotocol/sdk` (ACP 协议 TypeScript SDK) |
| 状态管理 | Zustand v5 (vanilla store, 无 React 依赖) |
| UI 框架 | React 18/19 |
| 国际化 | i18next + react-i18next |
| Markdown 渲染 | marked |
| 样式方案 | SCSS Modules + CSS 自定义属性 |
| 构建工具 | Vite 6 (库模式) |
| 类型检查 | TypeScript 5.6 (strict mode) |
| 测试框架 | Vitest + @testing-library/react + jsdom |
| 包管理 | pnpm (workspace monorepo) |

### 1.3 工程结构

```
acp-components/
├── packages/
│   ├── core/                          # @acp-components/core (框架无关)
│   │   └── src/
│   │       ├── client/                # AcpClient — 封装 ACP ClientSideConnection
│   │       │   └── AcpClient.ts
│   │       ├── transport/             # 传输层实现
│   │       │   ├── types.ts           # AcpTransport 接口定义
│   │       │   ├── stdio.ts           # 子进程 stdio 传输
│   │       │   ├── http.ts            # HTTP POST 传输
│   │       │   ├── ws.ts              # WebSocket 传输
│   │       │   └── index.ts
│   │       ├── store/                 # 全局状态管理 (Zustand vanilla)
│   │       │   ├── acpStore.ts        # 全局 store
│   │       │   └── sessionStore.ts    # 会话级 store
│   │       ├── actions/               # 命令式 actions（操作 store + client）
│   │       │   ├── sessions.ts        # 会话 CRUD
│   │       │   ├── prompt.ts          # 发送/取消 prompt
│   │       │   └── permission.ts      # 权限响应
│   │       ├── types/                 # 共享类型定义
│   │       │   └── index.ts
│   │       ├── provider.ts            # createAcpProvider() 工厂函数
│   │       └── index.ts
│   └── react/                         # @acp-components/react (React UI)
│       └── src/
│           ├── components/
│           │   ├── workbench/         # AcpProvider, Workbench, ProjectOpener
│           │   ├── chat-view/         # ChatView, MessageBubble, ChatComposer,
│           │   │                        ToolCallCard, StreamingIndicator,
│           │   │                        ThoughtView, PlanView
│           │   ├── session-list/      # SessionList
│           │   ├── session-config-panel/ # SessionConfigPanel
│           │   ├── diff-view/         # DiffView
│           │   ├── terminal-view/     # TerminalView
│           │   ├── permission-dialog/ # PermissionDialog
│           │   ├── status-bar/        # ConnectionStatus, UsageBar
│           │   └── command-palette/   # CommandPalette
│           ├── hooks/                 # React hooks (useSyncExternalStore)
│           │   ├── useAcpProvider.ts
│           │   ├── useAcpStore.ts
│           │   ├── useSessionStore.ts
│           │   ├── useSessions.ts
│           │   ├── useSession.ts
│           │   ├── usePrompt.ts
│           │   ├── useToolCalls.ts
│           │   ├── usePermission.ts
│           │   └── useConnectionStatus.ts
│           ├── context/               # AcpContext
│           │   └── AcpContext.ts
│           ├── i18n/                  # 国际化
│           │   ├── I18nProvider.tsx
│           │   ├── useI18n.ts
│           │   ├── locales/en-US.ts
│           │   └── locales/zh-CN.ts
│           ├── styles/
│           │   ├── themes.scss        # CSS 自定义属性（主题契约）
│           │   └── styles.css
│           └── index.ts
├── examples/
│   ├── demo/                          # Vite 浏览器 Demo (WebSocket 传输)
│   │   └── src/main.tsx
│   ├── server/                        # WebSocket ↔ stdio 桥接服务器
│   │   └── src/bridge.ts
│   └── tauri/                         # Tauri 桌面应用 (自定义 IPC 传输)
│       └── src/tauriIpcTransport.ts
├── package.json                       # 根工作空间配置
├── pnpm-workspace.yaml
└── tsconfig.json
```

---

## 2. 分层架构

### 2.1 整体架构图

```
┌──────────────────────────────────────────────────────────────────┐
│                    应用层 (Application)                           │
│  开发者使用 acp-components 搭建的 Agent 界面                       │
│  (Vite Demo / Tauri Desktop / 自定义应用)                         │
└───────────────────────────┬──────────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────────┐
│                UI 层: @acp-components/react                        │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  组件层 (Components)                                         │ │
│  │  Workbench  ChatView  SessionList  PermissionDialog         │ │
│  │  DiffView   TerminalView  CommandPalette  ToolCallCard      │ │
│  │  PlanView   ThoughtView  StreamingIndicator  UsageBar       │ │
│  ├─────────────────────────────────────────────────────────────┤ │
│  │  Hooks 层 (useSyncExternalStore over vanilla stores)        │ │
│  │  useAcpStore  useSessionStore  useSessions  useSession      │ │
│  │  usePrompt    useToolCalls     usePermission                │ │
│  │  useConnectionStatus  useAcpContext                         │ │
│  ├─────────────────────────────────────────────────────────────┤ │
│  │  AcpContext (React Context)                                  │ │
│  │  提供 client, config, projectCwd 给整个组件树                  │ │
│  └─────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  主题系统 (Design System)                                    │ │
│  │  CSS 自定义属性 (--acp-color-*, --acp-shadow-*)             │ │
│  │  data-acp-theme="dark" | "light"                            │ │
│  └─────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  国际化 (i18n)                                               │ │
│  │  i18next + react-i18next, 中英文支持                          │ │
│  └─────────────────────────────────────────────────────────────┘ │
└───────────────────────────┬──────────────────────────────────────┘
                            │ 依赖
┌───────────────────────────▼──────────────────────────────────────┐
│              数据层: @acp-components/core (框架无关)               │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  AcpClient (ACP 协议客户端封装)                               │ │
│  │  - connect(transport) → initialize(clientInfo, caps)         │ │
│  │  - prompt(sessionId, blocks) / cancel(sessionId)            │ │
│  │  - newSession / loadSession / closeSession / listSessions    │ │
│  │  - setSessionConfigOption                                    │ │
│  │  - onSessionUpdate / setPermissionHandler / setFileHandler   │ │
│  │  - status management (disconnected→connecting→connected)     │ │
│  └───────────────────────────┬─────────────────────────────────┘ │
│                              │                                    │
│  ┌───────────────────────────▼─────────────────────────────────┐ │
│  │  传输层 (Transport Layer)                                    │ │
│  │  ┌───────────────┐ ┌──────────────┐ ┌──────────────────────┐│ │
│  │  │StdioTransport │ │HttpTransport │ │WebSocketTransport    ││ │
│  │  │(Node.js only) │ │(fetch API)   │ │(Browser/Node)        ││ │
│  │  └───────────────┘ └──────────────┘ └──────────────────────┘│ │
│  │  所有传输均实现 AcpTransport 接口 (connect/disconnect/events) │ │
│  │  支持 Custom Transport (TauriIpcTransport 等)               │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  状态管理层 (Vanilla Zustand Stores, 无 React 依赖)           │ │
│  │                                                              │ │
│  │  acpStore (全局单例)                                         │ │
│  │  ├── connectionStatus / agentInfo / capabilities             │ │
│  │  ├── sessions (Map<SessionId, SessionMeta>)                 │ │
│  │  ├── activeSessionId / projectCwd                           │ │
│  │  └── actions: setConnectionStatus, setSessions,             │ │
│  │      addSession, removeSession, setActiveSession, ...       │ │
│  │                                                              │ │
│  │  sessionStore (全局单例，按 sessionId 分区)                    │ │
│  │  ├── sessions (Map<SessionId, SessionData>)                 │ │
│  │  │   └── SessionData: messages[], isStreaming,              │ │
│  │  │       pendingToolCalls, pendingPermissions,              │ │
│  │  │       plan[], usage, configOptions[],                    │ │
│  │  │       availableCommands[], stopReason                    │ │
│  │  └── actions: ensureSession, appendContent,                 │ │
│  │      appendThought, upsertToolCall, updateToolCall,         │ │
│  │      setPlan, setUsage, setConfigOptions, ...               │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  业务逻辑层 (Actions)                                        │ │
│  │  createSession / loadSession / selectSession / closeSession │ │
│  │  refreshSessions / setSessionConfigOption                   │ │
│  │  sendPrompt / cancelPrompt                                  │ │
│  │  respondToPermission / denyPermission                       │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  createAcpProvider() — 连接生命周期管理器                      │ │
│  │  1. 实例化 transport / AcpClient                             │ │
│  │  2. 订阅 onSessionUpdate → 分发到 stores                      │ │
│  │  3. 管理 connect → initialize → ready 状态机                  │ │
│  │  4. 注册 permission / file 回调处理                           │ │
│  └─────────────────────────────────────────────────────────────┘ │
└───────────────────────────┬──────────────────────────────────────┘
                            │ 依赖
┌───────────────────────────▼──────────────────────────────────────┐
│        @agentclientprotocol/sdk (ACP 协议实现)                     │
│  ClientSideConnection / NDJSON streaming / Protocol handshake     │
│  Client / Agent type definitions                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 核心设计原则

**数据与视图分离**

`@acp-components/core` 不依赖 React。其输出是纯 TypeScript 模块，暴露 vanilla Zustand stores 和命令式 actions。任何框架都可以通过 `store.getState()` / `store.subscribe()` 对接：

```ts
// Vue 示例 (概念)
import { acpStore, sessionStore, createAcpProvider } from '@acp-components/core';

const provider = createAcpProvider({ transport: { type: 'websocket', url: '...' }});
provider.subscribe(() => { /* ready */ });

// 通过 watch 或 computed 对接 vanilla stores
acpStore.subscribe((state) => { /* 全局状态变化 */ });
sessionStore.subscribe((state) => { /* 会话状态变化 */ });
```

**传输抽象**

所有传输实现都遵循 `AcpTransport` 接口（connect / disconnect / onClose / onError），支持 WebSocket、HTTP、stdio、自定义四种模式，通过 `TransportConfig` 的 discriminated union 类型进行类型安全的分发。

**双向通信与数据流**

ACP 协议层支持双向通信：Client 可以向 Agent 发送 prompt、会话指令等，Agent 也可以主动向 Client 推送消息块、工具调用状态、权限请求等。在前端内部，状态管理遵循单向循环模式。

```
                    ┌─────────────────────────────────────────┐
                    │            ACP 双向通信                   │
                    │  Client ──── prompt/session cmds ───→ Agent
                    │  Client ←── sessionUpdate/events ─── Agent
                    └─────────────────────────────────────────┘

前端内部状态管理（单向循环）:

Agent 推送 (sessionUpdate)
    ↓ NDJSON stream → Transport.readable
AcpClient.onSessionUpdate 事件
    ↓
createAcpProvider 分发到 stores
    ↓
acpStore / sessionStore (Zustand vanilla)
    ↓ useSyncExternalStore
React Hooks → Components (re-render)
    ↓ 用户操作
Actions (operate on client + stores)
    ↓ ACP protocol messages
AcpClient.prompt() / cancel() → Transport.writable → Agent
```

---

## 3. 核心模块设计

### 3.1 传输层 (Transport Layer)

#### 3.1.1 AcpTransport 接口

```typescript
// packages/core/src/transport/types.ts
interface AcpTransport {
  connect(): Promise<Stream>;              // 建立连接，返回可读写流
  disconnect(): void;                       // 断开连接
  onClose?: (handler: () => void) => () => void;   // 关闭事件
  onError?: (handler: (err: Error) => void) => () => void; // 错误事件
}
```

`Stream` 来自 `@agentclientprotocol/sdk`，包含 `{ readable: ReadableStream, writable: WritableStream }`。

#### 3.1.2 四种传输实现

| 传输类型 | 适用场景 | 数据方向 | 实现方式 |
|---------|---------|---------|---------|
| `StdioTransport` | Electron / Tauri / Node.js 桌面应用，直接启动 Agent 子进程 | stdin → Agent, stdout ← Agent | `child_process.spawn` + Web Streams API |
| `WebSocketTransport` | 浏览器环境，通过 WebSocket 连接桥接服务器 | ↔ JSON 消息双向 | 原生 `WebSocket` API |
| `HttpTransport` | HTTP POST 环境 | → 单向发送 | `fetch` API |
| `CustomTransport` | 任何自定义场景（如 Tauri IPC） | 自定义 | 实现 `AcpTransport` 接口 |

#### 3.1.3 传输工厂

```typescript
// packages/core/src/client/AcpClient.ts (内部函数)
function createTransport(config: TransportConfig): AcpTransport {
  switch (config.type) {
    case 'stdio':    return new StdioTransport({ command, args, env });
    case 'http':     return new HttpTransport({ url, headers });
    case 'websocket': return new WebSocketTransport({ url });
    case 'custom':   return config.transport; // 外部注入
  }
}
```

#### 3.1.4 Tauri IPC 自定义传输 (示例)

`examples/tauri/src/tauriIpcTransport.ts` 展示了如何通过自定义传输将 Agent 的 stdio 桥接到 Tauri IPC：

```
Agent stdout → Rust (line-by-line) → Tauri event "agent-output" → ReadableStream
Agent stdin  ← Rust (write)         ← Tauri invoke "write_to_agent" ← WritableStream
```

### 3.2 AcpClient

#### 3.2.1 职责

`AcpClient` 是 ACP 协议 SDK 的封装层，负责：

1. **连接管理**：通过 transport 建立连接，创建 `ClientSideConnection`
2. **协议代理**：将 ACP Client 接口（`sessionUpdate`, `requestPermission`, `readTextFile`, `writeTextFile`）转发给外部 handlers
3. **状态跟踪**：维护 `connectionStatus`（disconnected → connecting → connected / error）
4. **高层 API**：提供 `prompt()`, `cancel()`, `newSession()`, `loadSession()` 等方法

#### 3.2.2 事件模型

```
AcpClient 使用观察者模式（Set-based event emitter）:

  sessionUpdateHandlers  (Set<SessionUpdateHandler>)  — 订阅 ACP 会话更新
  permissionHandler      (PermissionHandler | null)    — 单例权限处理器
  fileReadHandler        (FileReadHandler | null)      — 单例文件读取
  fileWriteHandler       (FileWriteHandler | null)     — 单例文件写入
  statusHandlers         (Set<(status) => void>)       — 连接状态变化
```

#### 3.2.3 ACP Client 实现

```typescript
// 将内部 handlers 映射到 ACP SDK 的 Client 接口
const client: Client = {
  sessionUpdate: (params) => { /* 通知所有 sessionUpdateHandlers */ },
  requestPermission: (params) => { /* 调用 permissionHandler */ },
  readTextFile: (params) => { /* 调用 fileReadHandler */ },
  writeTextFile: (params) => { /* 调用 fileWriteHandler */ },
};

this.connection = new ClientSideConnection((_agent) => client, stream);
```

### 3.3 状态管理 (Store Layer)

#### 3.3.1 设计要点

- 使用 `zustand/vanilla` 的 `createStore()`，完全不依赖 React
- 两个全局单例 store：`acpStore` 和 `sessionStore`
- 所有状态更新都是不可变的（创建新的 Map 实例）
- Session store 使用 `Map<SessionId, SessionData>` 模式实现多会话隔离

#### 3.3.2 acpStore — 全局状态

```typescript
interface AcpStoreState {
  // 连接
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  agentInfo: Implementation | null;
  capabilities: Record<string, unknown> | null;

  // 会话
  sessions: Map<SessionId, SessionMeta>;   // 会话列表
  activeSessionId: SessionId | null;        // 当前活跃会话

  // 项目
  projectCwd: string;                       // 当前项目路径

  // Actions (setters)
  setConnectionStatus / setAgentInfo / setCapabilities
  setSessions / addSession / removeSession / updateSession
  setActiveSession / setProjectCwd
}
```

#### 3.3.3 sessionStore — 会话级状态

```typescript
interface SessionData {
  messages: Message[];                      // 消息列表
  isStreaming: boolean;                     // 是否正在流式输出
  pendingToolCalls: Map<string, ToolCallState>; // 工具调用跟踪
  stopReason: StopReason | null;            // 停止原因
  pendingPermissions: PermissionRequest[];  // 待处理权限请求
  plan: PlanEntry[];                        // Agent 计划
  usage: UsageUpdate | null;               // Token 用量
  configOptions: SessionConfigOption[];     // 会话配置选项
  availableCommands: AvailableCommand[];     // 可用命令/斜杠命令
}

interface SessionStoreState {
  sessions: Map<SessionId, SessionData>;

  // Actions
  ensureSession / removeSession / resetSession
  addMessage / updateMessage
  appendContent / appendThought
  setIsStreaming / setStopReason
  upsertToolCall / updateToolCall
  addPermissionRequest / removePermissionRequest
  setPlan / setUsage / setConfigOptions / setAvailableCommands
}
```

#### 3.3.4 流式内容追加逻辑

`appendContent` 和 `appendThought` 是核心的流式更新方法，处理两个关键场景：

1. **同一 text block 尾部追加**：如果最后一个 content block 是 text 类型，且新来的也是 text，则拼接字符串，减少对象创建
2. **新 block 创建**：否则创建新的 content block 或新的 message part

```typescript
// appendContent 的核心逻辑
appendContent: (sessionId, messageId, role, block) =>
  set((s) => {
    const messages = /* 查找或创建 message */;
    if (last?.type === 'content') {
      if (lastBlock.type === 'text' && block.type === 'text') {
        // 追加到同一个 text block (性能优化)
        return { text: lastBlock.text + block.text };
      }
      // 追加新的 content block
      return [...blocks, block];
    }
    // 创建新的 message part
    return [...parts, { type: 'content', content: [block] }];
  }),
```

#### 3.3.5 Tool Call 管理

Tool call 采用双重索引策略：
- `pendingToolCalls: Map<toolCallId, ToolCallState>` — 用于快速查找和更新
- 同时嵌入 `messages[].parts[]` 中作为 `tool_calls` 类型的 part — 用于 UI 按时间线渲染

### 3.4 Provider 工厂 (createAcpProvider)

#### 3.4.1 核心职责

`createAcpProvider()` 是连接传输层、客户端和状态管理的核心编排器。

```
createAcpProvider({ transport, clientInfo, clientCapabilities, onFileRead, onFileWrite })

  1. 创建 AcpClient (单例复用)
  2. 订阅 client.onStatusChange → acpStore.setConnectionStatus()
  3. 订阅 client.onSessionUpdate → 解析 12 种 sessionUpdate 类型 → 分发到对应 store actions
  4. 设置 client.setPermissionHandler() → Promise 化权限请求 → sessionStore
  5. 设置 client.setFileReadHandler / setFileWriteHandler
  6. 组装 ClientCapabilities
  7. 执行 connect() → initialize() 流程
  8. 初始化完成后 listSessions() 获取历史会话
  9. 返回 { client, ready, subscribe, destroy }
```

#### 3.4.2 SessionUpdate 分发映射

`createAcpProvider` 将 ACP 协议的 12 种 `sessionUpdate` 类型映射为 store 操作：

| SessionUpdate 类型 | Store Action |
|-------------------|-------------|
| `agent_message_chunk` | `sessionStore.appendContent(sessionId, msgId, 'agent', content)` |
| `user_message_chunk` | `sessionStore.appendContent(sessionId, msgId, 'user', content)` |
| `agent_thought_chunk` | `sessionStore.appendThought(sessionId, msgId, 'agent', content)` |
| `tool_call` | `sessionStore.upsertToolCall(sessionId, toolCallState)` |
| `tool_call_update` | `sessionStore.updateToolCall(sessionId, toolCallId, patch)` |
| `plan` | `sessionStore.setPlan(sessionId, entries)` |
| `session_info_update` | `acpStore.updateSession(sessionId, { title, updatedAt })` |
| `usage_update` | `sessionStore.setUsage(sessionId, usage)` |
| `config_option_update` | `sessionStore.setConfigOptions(sessionId, configOptions)` |
| `available_commands_update` | `sessionStore.setAvailableCommands(sessionId, commands)` |

#### 3.4.3 权限请求的 Promise 化处理

ACP 协议中权限请求是回调式的，Provider 将其包装为 Promise，存储在 `sessionStore.pendingPermissions` 中供 UI 消费：

```typescript
client.setPermissionHandler((req) => {
  return new Promise((resolve) => {
    const permissionReq = {
      sessionId: req.sessionId,
      toolCall: req.toolCall,
      options: req.options,
      resolve: (optionId) => resolve({ outcome: { outcome: 'selected', optionId } }),
      reject: () => resolve({ outcome: { outcome: 'cancelled' } }),
    };
    sessStore.addPermissionRequest(req.sessionId, permissionReq);
  });
});
```

### 3.5 Actions 层

Actions 是命令式函数，操作 `AcpClient` + `acpStore` + `sessionStore` 三者完成业务逻辑。

| Action | 操作 | 说明 |
|--------|------|------|
| `createSession` | client.newSession + acpStore.addSession + sessionStore.ensureSession | 创建新会话 |
| `loadSession` | client.loadSession + sessionStore.resetSession | 加载已有会话 |
| `selectSession` | acpStore.setActiveSession + loadSession | 切换会话 |
| `closeSession` | client.closeSession + acpStore.removeSession + sessionStore.removeSession | 关闭会话 |
| `refreshSessions` | client.listSessions + acpStore.setSessions | 刷新会话列表 |
| `setSessionConfigOption` | client.setSessionConfigOption + sessionStore.setConfigOptions | 设置配置项 |
| `sendPrompt` | 创建 user message → client.prompt → stopReason | 发送消息 |
| `cancelPrompt` | client.cancel | 取消生成 |
| `respondToPermission` | 调用 permissionReq.resolve + removePermissionRequest | 同意权限 |
| `denyPermission` | 调用 permissionReq.reject + removePermissionRequest | 拒绝权限 |

---

## 4. UI 层设计 (@acp-components/react)

### 4.1 组件树

```
<I18nProvider>
  <AcpProvider transport={...} theme="dark">
    <Workbench
      sidebar={
        <>
          <ProjectOpener />
          <SessionList />
        </>
      }
      main={<ChatView sessionId={activeSessionId} />}
    />
    <PermissionDialog sessionId={activeSessionId} />
  </AcpProvider>
</I18nProvider>
```

### 4.2 AcpProvider 组件

`AcpProvider` 是 React 层的顶级入口，负责：

1. 调用 `useAcpProvider(options)` hook 管理连接生命周期
2. 在连接未就绪时渲染 Loading 状态（spinner + 文案）
3. 连接就绪后通过 `AcpContext.Provider` 向子组件树注入 `{ client, config, clientInfo, projectCwd }`
4. 在根 DOM 节点设置 `data-acp-theme` 属性激活主题

```
AcpProvider 状态机:
  ┌──────────┐    useAcpProvider()   ┌──────────┐
  │  Loading  │─────────────────────▶│  Ready   │
  │ spinner   │   ready === true     │ children │
  └──────────┘                       └──────────┘
```

### 4.3 Workbench 布局

三区布局，使用 CSS Grid：

```
┌──────────┬─────────────────────────┬──────────┐
│          │                         │          │
│ Sidebar  │         Main            │  Panel   │
│ (240px)  │       (1fr)             │ (可选)    │
│          │                         │          │
└──────────┴─────────────────────────┴──────────┘
```

- `sidebar`：SessionList + ProjectOpener
- `main`：ChatView（消息列表 + 输入框）
- `panel`（可选）：DiffView / TerminalView 等辅助面板

### 4.4 ChatView 核心渲染

#### 4.4.1 消息轮次分组

`ChatView` 将消息按"用户消息 + 后续 Agent 消息"分组成 Rounds：

```typescript
function groupMessagesIntoRounds(messages: Message[]): Round[] {
  // user → 开始新 round
  // agent → 追加到当前 round
  // 渲染时每个 round 包含一个用户气泡和一组 Agent 气泡
}
```

#### 4.4.2 Message 渲染

每个 `Message` 由 `MessagePart[]` 组成，`MessageBubble` 按顺序渲染：

```
Message
  ├── parts[0]: { type: 'content', content: ContentBlock[] }
  │     └── 渲染 Markdown / ToolCallCard
  ├── parts[1]: { type: 'thought', thought: ContentBlock[] }
  │     └── ThoughtView (可折叠)
  └── parts[2]: { type: 'tool_calls', toolCalls: ToolCallState[] }
        └── ToolCallCard 列表
```

### 4.5 Hooks 设计

#### 4.5.1 底层 Store Hooks

```typescript
// 直接订阅 vanilla store，使用 zustand/react 的 useStore (基于 useSyncExternalStore)
function useAcpStore<T>(selector?: (state) => T): T;
function useSessionStore<T>(selector?: (state) => T): T;
```

#### 4.5.2 领域 Hooks

所有领域 hooks 都遵循"从 store 读取数据 + 从 context 获取 client + 调用 core actions"模式：

```typescript
// useSessions — 封装会话 CRUD
function useSessions() {
  const { client } = useAcpContext();           // 获取 client
  const sessions = useAcpStore(s => s.sessions); // 订阅数据

  const createSession = useCallback(async (cwd?) => {
    return coreCreateSession(client, cwd);       // 调用 core action
  }, [client]);

  return { sessions: Array.from(sessions.values()), createSession, ... };
}

// useSession — 获取单个会话的完整数据
function useSession(sessionId) {
  const sessions = useStore(sessionStore, s => s.sessions);
  // 返回 messages, isStreaming, pendingToolCalls, plan, usage, ...
}

// usePrompt — 发送/取消消息
function usePrompt(sessionId) {
  const { client } = useAcpContext();
  return {
    send: (blocks) => sendPrompt(client, sessionId, blocks),
    cancel: () => cancelPrompt(client, sessionId),
  };
}
```

#### 4.5.3 Hook 依赖关系

```
useAcpContext (React Context)
  ├── useAcpProvider (useEffect + useRef)
  ├── useSessions → useAcpContext + useAcpStore
  ├── useSession → sessionStore (vanilla)
  │     ├── useToolCalls → useSession
  │     ├── usePermission → useSession
  ├── usePrompt → useAcpContext
  ├── useConnectionStatus → useAcpStore
  ├── useAcpStore → acpStore (zustand/react)
  └── useSessionStore → sessionStore (zustand/react)
```

### 4.6 主题系统

#### 4.6.1 设计理念

采用 **CSS 自定义属性（CSS Custom Properties）** 作为主题契约。所有组件样式只引用 `--acp-*` 变量，不硬编码颜色值。

#### 4.6.2 主题变量体系

```
--acp-color-bg-*        (primary, secondary, tertiary, hover, glass, input, code, overlay)
--acp-color-text-*      (primary, secondary, muted, inverse)
--acp-color-border-*    (default, subtle, accent)
--acp-color-accent-*    (default, hover, muted, text)
--acp-color-status-*    (success, warning, error, info, +muted variants)
--acp-color-user-*      (bubble, text)
--acp-color-agent-*     (bubble, text)
--acp-shadow-*          (xs, sm, md, lg)
--acp-radius-*          (xs, sm, md, lg, xl)
--acp-font-*            (sans, mono)
--acp-duration-*        (fast, normal, slow)
--acp-ease-*            (out, in-out, spring)
```

#### 4.6.3 主题切换

通过 `data-acp-theme` 属性切换：

- `[data-acp-theme='dark']` — "Warp" 暗色主题（默认），深蓝黑底 + 青色电光强调
- `[data-acp-theme='light']` — "Frost" 亮色主题，冷白蓝灰表面 + 青色强调

开发者可通过提供自定义 `[data-acp-theme='my-theme']` 覆盖所有变量来实现自定义主题。

### 4.7 国际化 (i18n)

#### 4.7.1 架构

```
I18nProvider (封装 i18next)
  ├── 自动检测语言：localStorage → navigator.language → defaultLocale
  ├── 内置语言包：en-US, zh-CN
  ├── 支持 customLocales 扩展/覆盖
  └── useI18n() hook 暴露 { t, i18n }
```

#### 4.7.2 翻译 Key 命名规范

```
{组件名}.{用途}

示例：
  composer.placeholder       → ChatComposer 输入框占位符
  permission.title           → PermissionDialog 标题
  sessionList.newSession     → 新建会话按钮
  commandPalette.searchPlaceholder → 命令面板搜索框
```

### 4.8 组件列表

| 组件 | 功能 | Props |
|------|------|-------|
| `AcpProvider` | 顶层 Provider，管理连接生命周期和主题 | `transport`, `clientInfo`, `clientCapabilities`, `theme`, `defaultCwd`, `onFileRead`, `onFileWrite` |
| `Workbench` | 三栏布局容器 | `sidebar?`, `main?`, `panel?`, `className?` |
| `ProjectOpener` | 项目目录显示与切换 | `onBrowse` |
| `SessionList` | 会话列表（创建/选择/删除） | 无（从 store 读取） |
| `ChatView` | 主聊天区域，含消息列表 + 输入框 | `sessionId`, `onNavigateFile?` |
| `MessageBubble` | 消息气泡渲染 | `messages`, `isStreaming?`, `onNavigateFile?` |
| `ChatComposer` | 消息输入框 + 命令面板 | `sessionId`, `isStreaming`, `availableCommands` |
| `ToolCallCard` | 工具调用状态卡片 | `toolCall`, `onNavigateFile?` |
| `ThoughtView` | 可折叠的思考内容视图 | `thoughts`, `isStreaming?` |
| `PlanView` | 计划条目显示 | `entries`, `isStreaming` |
| `StreamingIndicator` | 流式输出动画指示器 | 无 |
| `DiffView` | 文件差异对比 | `diffs` |
| `TerminalView` | 终端输出显示 | `output` |
| `PermissionDialog` | 权限请求模态框 | `sessionId` |
| `ConnectionStatus` | 连接状态指示器 | 无 |
| `UsageBar` | Token 用量进度条 | `sessionId` |
| `SessionConfigPanel` | 会话配置下拉菜单 | `sessionId` |
| `CommandPalette` | 斜杠命令面板 | `commands`, `onSelect`, `onClose` |

---

## 5. 数据流

### 5.1 Agent 消息流式接收流程

```
                           ┌──────────┐
  Agent stdout ──────────▶│ Transport │ (NDJSON / JSON 消息)
  (子进程 / WS)            └────┬─────┘
                               │ Stream.readable
                           ┌───▼──────────┐
                           │ AcpClient     │
                           │ (ClientSideConnection)
                           └───┬──────────┘
                               │ sessionUpdate(params)
                           ┌───▼──────────────┐
                           │createAcpProvider │
                           │ onSessionUpdate  │
                           └───┬──────────────┘
                               │ switch(update.sessionUpdate)
                               │
          ┌────────────────────┼────────────────────────┐
          ▼                    ▼                         ▼
  agent_message_chunk    tool_call              usage_update
  sessionStore           sessionStore           sessionStore
  .appendContent()       .upsertToolCall()      .setUsage()
          │                    │                         │
          ▼                    ▼                         ▼
  ┌──────────────────────────────────────────────────────┐
  │              Zustand State Update                     │
  │  触发 subscribe 回调 → React useSyncExternalStore     │
  └──────────────────────┬───────────────────────────────┘
                         │
                         ▼
  ┌──────────────────────────────────────────────────────┐
  │               React Re-render                         │
  │  useSession(sessionId) → ChatView → MessageBubble    │
  └──────────────────────────────────────────────────────┘
```

### 5.2 用户发送消息流程

```
  用户输入 + 点击发送
         │
         ▼
  ChatComposer → usePrompt(sessionId).send(blocks)
         │
         ▼
  sendPrompt(client, sessionId, blocks)
         │
         ├── sessionStore.addMessage(userMsg)  // 立即显示用户消息
         ├── sessionStore.setIsStreaming(true)
         │
         ▼
  client.prompt(sessionId, blocks)
         │
         │  Agent 开始流式返回 → onSessionUpdate → stores
         │  ...
         │  Agent 返回 PromptResponse
         ▼
  sessionStore.setStopReason(res.stopReason)
  sessionStore.setIsStreaming(false)
```

### 5.3 权限流程

```
  Agent 请求执行 tool
       │
       ▼
  ClientSideConnection → requestPermission(params)
       │
       ▼
  AcpClient.permissionHandler = () => new Promise(...)
       │
       ▼
  sessionStore.addPermissionRequest(sessionId, permissionReq)
       │
       ▼
  usePermission(sessionId) → currentRequest
       │
       ▼
  PermissionDialog 展示权限请求
       │
       ├── 用户点击 Allow → respondToPermission(sessionId, optionId)
       │       └── permissionReq.resolve(optionId) → Promise resolved
       │
       └── 用户点击 Deny → denyPermission(sessionId)
               └── permissionReq.reject() → Promise resolved
```

---

## 6. 示例工程

### 6.1 Demo (examples/demo)

基于 Vite 的浏览器 Demo，使用 WebSocket 传输：

```
Browser (Vite dev server :5173)
    │ WebSocket
    ▼
acp-server (examples/server :3100)
    │ child_process.spawn
    ▼
Agent process (opencode acp)
```

核心代码（[examples/demo/src/main.tsx](examples/demo/src/main.tsx)）：

```tsx
<I18nProvider>
  <AcpProvider transport={{ type: 'websocket', url: 'ws://127.0.0.1:3100' }} theme="dark">
    <Workbench
      sidebar={<><ProjectOpener onBrowse={handleBrowse} /><SessionList /></>}
      main={<ChatView sessionId={activeSessionId} />}
    />
    <PermissionDialog sessionId={activeSessionId} />
  </AcpProvider>
</I18nProvider>
```

### 6.2 Bridge Server (examples/server)

WebSocket ↔ stdio 桥接服务器，核心是 [bridge.ts](examples/server/src/bridge.ts) 中的 `createBridge()` 函数：

- 为每个 WebSocket 连接创建一个 Agent 子进程
- Agent stdout 按行读取 → WebSocket send
- WebSocket message → Agent stdin write
- 生命周期绑定：ws close → kill agent, agent exit → close ws

### 6.3 Tauri Desktop (examples/tauri)

桌面应用示例，通过自定义 `TauriIpcTransport` 将 Agent stdio 桥接到 Tauri IPC：

- `start_agent` command → Rust 启动 Agent 进程
- `agent-output` event → ReadableStream
- `write_to_agent` command → WritableStream → Agent stdin

展示了如何通过实现 `AcpTransport` 接口，将 `@acp-components/core` 适配到任意通信层。

---

## 7. 扩展性设计

### 7.1 支持其他 UI 框架

由于 `@acp-components/core` 完全不依赖 React，开发者可以基于它为 Vue/Svelte/Solid 等框架创建组件库：

```typescript
// 伪代码：Vue 组件库概念
import { acpStore, sessionStore, createAcpProvider } from '@acp-components/core';

// 1. 创建 provider
const provider = createAcpProvider({ transport: { type: 'websocket', url: '...' } });

// 2. 在 Vue composable 中订阅 vanilla stores
function useAcpStore(selector) {
  return vueRef(() => {
    const state = ref(selector(acpStore.getState()));
    const unsub = acpStore.subscribe((s) => { state.value = selector(s); });
    onUnmounted(unsub);
    return state;
  });
}
```

只需实现框架对应的 store 桥接层和组件模板，即可拥有一套完整的 Agent UI 组件库。

### 7.2 自定义传输

任何实现了 `AcpTransport` 接口的类都可以作为传输层：

```typescript
class MyCustomTransport implements AcpTransport {
  async connect(): Promise<Stream> { /* 自定义连接逻辑 */ }
  disconnect(): void { /* 自定义断开逻辑 */ }
  onClose(handler) { /* 注册关闭回调 */ }
  onError(handler) { /* 注册错误回调 */ }
}

// 使用
<AcpProvider transport={{ type: 'custom', transport: new MyCustomTransport() }}>
```

实际案例：`TauriIpcTransport`（Tauri IPC 传输）、可扩展到 Electron IPC、Chrome Extension、iframe postMessage 等场景。

### 7.3 自定义主题

通过覆盖 CSS 自定义属性创建新主题：

```css
[data-acp-theme='my-theme'] {
  --acp-color-bg-primary: #ffffff;
  --acp-color-accent: #ff6b6b;
  /* 覆盖所有需要的变量... */
}
```

然后传入 `theme` prop：`<AcpProvider theme="my-theme">`

### 7.4 自定义国际化

通过 `customLocales` 扩展或覆盖翻译：

```tsx
<I18nProvider
  defaultLocale="ja-JP"
  customLocales={{
    'ja-JP': {
      'composer.placeholder': 'メッセージを入力...',
      'permission.title': '権限が必要です',
    },
  }}
>
```

### 7.5 文件系统处理

通过 `onFileRead` 和 `onFileWrite` 回调，开发者可以控制 Agent 如何读取/写入文件：

```tsx
<AcpProvider
  transport={...}
  onFileRead={async (req) => {
    // 自定义文件读取逻辑（如通过 Tauri fs API）
    const content = await tauriFs.readTextFile(req.path);
    return { content };
  }}
  onFileWrite={async (req) => {
    // 自定义文件写入逻辑
    await tauriFs.writeTextFile(req.path, req.content);
    return {};
  }}
>
```

---

## 8. 构建与发布

### 8.1 构建配置

- **core**：Vite 库模式，输出 ESM + CJS 双格式，外部化 `zustand/vanilla` 和 `@agentclientprotocol/sdk`
- **react**：Vite 库模式，输出 ESM + CJS 双格式，外部化 `react`、`react-dom`、`zustand`、`@acp-components/core`，CSS 合并为单文件

### 8.2 构建产物

```
packages/core/dist/
  ├── index.mjs      (ESM)
  ├── index.cjs      (CJS)
  └── index.d.ts     (类型声明)

packages/react/dist/
  ├── index.mjs      (ESM)
  ├── index.cjs      (CJS)
  ├── index.d.ts     (类型声明)
  └── react.css      (合并后的样式文件)
```

### 8.3 开发流程

```bash
# 构建所有包
pnpm build

# Web Demo 开发
pnpm dev:server    # 终端1: 启动桥接服务器
pnpm dev           # 终端2: 启动 Vite Demo

# Tauri 开发
pnpm dev:tauri

# 运行测试
pnpm test
```

---

## 9. 关键设计决策

### 9.1 为什么选择 Zustand vanilla 而非 Redux / MobX

- **零依赖 React**：`zustand/vanilla` 的 `createStore()` 是纯 JS 方案，不依赖任何框架
- **极简 API**：`getState()` / `set()` / `subscribe()` 即可完成所有操作
- **体积小**：Zustand v5 核心约 1KB，对组件库包体积影响小
- **框架桥接简单**：React 侧通过 `zustand/react` 的 `useStore`（基于 `useSyncExternalStore`）即可订阅

### 9.2 为什么使用 Map 而非普通对象

- `sessionStore.sessions` 使用 `Map<SessionId, SessionData>`，因为会话 ID 是动态的，Map 在高频增删场景下性能优于对象
- Zustand 的不可变更新要求每次创建新 Map 实例：`new Map(state.sessions)`

### 9.3 为什么权限请求用 Promise 而非 callback

ACP SDK 的 `requestPermission` 是 async 方法，使用 Promise 是最自然的处理方式。Provider 将 Promise 的 resolve/reject 暴露给 UI 层，UI 层调用 action 来满足 Promise。

### 9.4 为什么 AcpClient 用单例

`createAcpProvider` 中通过 `globalClient` 变量确保同一个 JS 运行时只有一个 `AcpClient` 实例。这是因为 ACP 协议只需要一条连接，多个 client 实例可能导致重复连接和状态不同步。

---

## 10. 后续规划

- [ ] 接入测试覆盖率（unit + integration tests）
- [ ] Vue/Svelte 适配层示例
- [ ] 更多传输实现（Electron IPC、Chrome Extension、SharedWorker）
- [ ] Agent 能力发现与动态 UI 适配
- [ ] 更多 UI 组件（文件树、Markdown 编辑器内联、多模态输入支持）
- [ ] 组件 Storybook 文档站
- [ ] 可访问性（a11y）审计与增强
- [ ] 移动端响应式布局
