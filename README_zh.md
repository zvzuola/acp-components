# acp-components

[English](README.md)

基于 [Agent Client Protocol (ACP)](https://github.com/agentclientprotocol/agent-client-protocol) 协议的通用前端组件库，用于快速搭建 AI Agent 交互界面。项目采用**数据层与 UI 层分离**的架构设计：

- **`@acp-components/core`** — 框架无关的纯 TypeScript 模块：传输通信、状态管理、业务逻辑
- **`@acp-components/react`** — React 组件库：界面渲染与用户交互

开发者可以只使用数据层，配合 Vue、Svelte 等其他前端框架搭建自己的 UI 组件库。

## 特性

- **多 Agent 支持** — 同时连接多个 ACP Agent，每个 Agent 拥有独立的传输层、能力和会话管理。用户添加的 Agent 会持久化到 `storage('agents')` 并在下次启动时恢复；内置（宿主提供的）Agent 不可被用户移除
- **多工作区支持** — 按工作目录（cwd）组织会话，可无缝切换工作区。工作区列表通过内置的 `<PlatformWorkspacesAuto>` 驱动持久化到 `storage('workspaces')`
- **框架无关核心** — Zustand vanilla stores，零 React 依赖；支持 Vue、Svelte、Solid 或纯 JS
- **多传输协议** — 每个 Agent 可独立配置 Stdio、HTTP、WebSocket 及自定义传输。Stdio 的启动能力由宿主通过 `platform.process.createStdioTransport` 提供（无法启动子进程的 Web 宿主直接省略即可）；附带 Tauri IPC 传输示例
- **统一的 Workbench Shell** — `WorkbenchShell` 将 `Sidebar`（顶部导航按钮 + 可切换主体 + 底部栏）与主区域串联：按导航项切换主视图（Sessions → `SessionView`、Skills → `SkillView`、New Session、Settings，以及宿主注入的视图）
- **丰富的 UI 组件** — SessionView（聊天 + Files 侧边栏，含 FileTree 与 FileViewer）、SkillView、SettingsView、聊天视图（回合分组）、Diff 视图、权限弹窗、计划视图、思考视图、命令面板、登录弹窗、Dropdown、Select、状态栏等 25+ 组件
- **文件树与文件查看器** — 按工作区分的文件树（懒加载展开、可选实时监听）以及面板内基于 Monaco 的文件查看器（语法高亮、行定位）；两者均由 `platform.fs` 零配置驱动
- **技能目录** — `SkillView` 通过 `listSkills()` 实时拉取每个已连接 Agent 的技能目录，按作用域（用户级 vs 项目 cwd）分组展示
- **设置界面** — 全屏 `SettingsView`，含 Appearance（主题）与 Agents 管理 panels，通过追加 `SETTINGS_SECTIONS` 即可扩展
- **流式交互体验** — 实时内容与思考过程流式展示（按会话批次聚合），动画指示器，工具调用状态跟踪，Token 用量统计
- **会话管理** — 完整 CRUD：创建、加载、切换、关闭、删除、fork、刷新、加载更多——按工作区和 Agent 维度管理
- **工具调用可视化** — 追踪 Agent 工具调用，展示状态、输入/输出、文件定位和差异对比
- **认证** — 内置认证流程，包含 `LoginDialog` 组件，支持 env_var 和 terminal 两种认证方式，以及 `authenticate`/`authenticateWithEnv` 编程式 actions
- **权限处理** — 基于 Promise 的权限流程，内置模态弹窗用于批准或拒绝工具调用请求
- **主题系统** — 通过 CSS 自定义属性（`--acp-*` 设计令牌）提供暗色/亮色主题；运行时通过 `useSettings().setTheme()` 切换；通过 `data-acp-theme` 属性可扩展自定义主题
- **国际化** — 内置 i18n（英文、中文）基于 i18next，语言自动检测来源于宿主 `Platform.system.getLocale()`
- **桌面端就绪** — 包含 Tauri 和 stdio 传输示例，可直接用于原生桌面应用开发

## 效果截图

### Web 演示

![ACP Web Demo](assets/screenshot-web.png)

### Tauri 桌面应用

![ACP Tauri Desktop](assets/screenshot-tauri.png)

## 包结构

| 包 | 说明 |
|---------|-------------|
| [@acp-components/core](packages/core) | 框架无关：多 Agent 传输层、AcpClient、vanilla Zustand stores（工作区 + Agent + 会话 + 文件树 + 文件查看器 + 技能）、命令式 actions |
| [@acp-components/react](packages/react) | React 绑定：Context Providers（`AcpContext` / `Platform` / `Settings` / `I18n`）、Hooks（useSyncExternalStore）、25+ UI 组件 |

## 安装

```bash
pnpm add @acp-components/core @acp-components/react
```

**Peer 依赖**：`react`（^18 || ^19）、`react-dom`（^18 || ^19）。`monaco-editor` 为可选 peer 依赖——仅在使用内置 `FileViewer` 时需要。

## 快速开始

最简配置与 Web demo 一致：用 `<PlatformProvider>` 提供宿主原生能力，用 `<I18nProvider>` 提供翻译，用 `<AcpProvider>` 管理 Agent 连接。其内部 `WorkbenchShell` 渲染整套布局——侧边栏导航加上按导航项在 Sessions / Skills / New Session / Settings 视图间切换的主区域。

```tsx
import ReactDOM from 'react-dom/client';
import {
  I18nProvider,
  PlatformProvider,
  AcpProvider,
  WorkbenchShell,
  PermissionPrompt,
  LoginDialog,
  useAcpStore,
} from '@acp-components/react';
// createWebPlatform 是宿主侧工厂；demo 内置实现见
// examples/demo/src/webPlatform.ts。自定义宿主请自行实现。
import { createWebPlatform } from './webPlatform';

function AppInner() {
  const activeSessionId = useAcpStore((s) => s.activeSessionId);

  return (
    <>
      <WorkbenchShell sessionId={activeSessionId} />
      <LoginDialog />
    </>
  );
}

function App() {
  return (
    <PlatformProvider platform={createWebPlatform()}>
      <I18nProvider>
        <AcpProvider
          agents={[
            {
              id: 'main',
              name: '主 Agent',
              transport: { type: 'websocket', url: 'ws://127.0.0.1:3100' },
            },
          ]}
          theme="dark"
        >
          <AppInner />
        </AcpProvider>
      </I18nProvider>
    </PlatformProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
```

`WorkbenchShell` 持有当前视图状态及内置导航（New Session、Skills）。首次启动默认进入 New Session 视图，一旦有会话激活即自动切回会话视图。`SessionList` 内部的目录选择由 `usePlatform().dialogs?.openFilePicker()` 驱动——无需 `onBrowse` prop。

### 多 Agent 示例

同时连接不同模式下的多个 Agent：

```tsx
<AcpProvider
  agents={[
    {
      id: 'craft',
      name: 'Craft Agent',
      transport: { type: 'websocket', url: 'ws://127.0.0.1:3100' },
    },
    {
      id: 'ask',
      name: 'Ask Agent',
      transport: { type: 'stdio', command: 'opencode', args: ['acp', '--mode', 'ask'] },
    },
  ]}
  theme="dark"
>
  <App />
</AcpProvider>
```

> `{ type: 'stdio' }` 配置要求宿主提供 `platform.process.createStdioTransport`（进程才能真正被启动）。省略了 `process` 的 Web 宿主会让 stdio 配置在连接时立即失败——因此浏览器场景应改用 `websocket` 连接桥接服务。

## 传输方式

`agents` 数组中的每个 Agent 可独立配置传输方式：

```tsx
// Stdio — 直接启动 Agent 子进程（Electron / Tauri / Node.js 桌面应用）。
// 需宿主提供 platform.process.createStdioTransport。
{
  id: 'desktop-agent',
  name: '桌面 Agent',
  transport: { type: 'stdio', command: 'opencode', args: ['acp'] },
}

// HTTP — 通过 HTTP POST 连接
{
  id: 'http-agent',
  name: 'HTTP Agent',
  transport: { type: 'http', url: 'http://localhost:8080/acp', headers: { 'Authorization': 'Bearer token' } },
}

// WebSocket — 连接桥接服务（浏览器环境）
{
  id: 'ws-agent',
  name: 'WebSocket Agent',
  transport: { type: 'websocket', url: 'ws://127.0.0.1:3100' },
}

// Custom — 提供自定义 AcpTransport 实现
{
  id: 'custom-agent',
  name: '自定义 Agent',
  transport: { type: 'custom', transport: myCustomTransport },
}
```

## 组件

| 组件 | 说明 |
|-----------|-------------|
| `AcpProvider` | 顶层 Provider：并行连接内置 Agent 集合，管理 Agent 生命周期，将用户添加的 Agent 持久化到 `storage('agents')`，将会话更新分发到 stores，对外暴露 `SettingsContext`（运行时主题），内置 Agent 就绪前显示加载动画。Props：`agents`、`theme`（初始）、`children` |
| `WorkbenchShell` | 串联整套布局：左侧 `Sidebar`（顶部导航 + 可切换主体 + 底部栏），主区域按当前导航项切换视图（Sessions → `SessionView`、Skills → `SkillView`、New Session → `NewSessionView`、Settings → `SettingsView`，以及宿主注入的 `navItems`）。Props：`sessionId`、`navItems`、`sidebarWidth`、`panelWidth`…… |
| `Workbench` | 底层三栏布局（侧边栏、主区域、面板），基于 CSS Grid——`WorkbenchShell` 构建在其之上 |
| `Sidebar` | 纯渲染组件：全宽图标+文字导航按钮 + `SessionList` 主体 + `SettingsMenu` 底部栏。Props：`activeView`、`onActiveViewChange`、`navItems`、`onSelectSession`、`onOpenSettings` |
| `SessionView` | 当前会话界面：左侧 `ChatView`，右侧可调整大小的侧边栏，内置 Files 标签页（`FileTree` + 已打开的 `FileViewer`，双列）及宿主注入的标签页。Props：`sessionId`、`tabs`、`activeTabId`、`panelWidth`、`showFilesTab`…… |
| `SessionList` | 侧边栏主体：按工作区目录分组，工作区内按 Agent 分组展示会话，支持添加工作区/创建/选择/删除操作 |
| `ChatView` | 主聊天区域：将消息分组为用户/Agent 回合，渲染计划、用量条和配置面板。Props：`sessionId`、`onNavigateFile` |
| `MessageBubble` | 渲染消息内容（内容块、思考块、工具调用），通过 `react-markdown` 支持 Markdown |
| `Markdown` | 可复用的 Markdown 渲染器，支持语法高亮代码块和 GFM |
| `ChatComposer` | 文本输入框，集成斜杠命令面板和发送/取消控制 |
| `StreamingIndicator` | Agent 流式输出时的动画打字指示器 |
| `ToolCallCard` | 展示工具调用名称、状态、输入/输出、文件位置 |
| `ThoughtView` | 可折叠的 Agent 推理/思考内容视图 |
| `PlanView` | 流式输出时展示 Agent 计划条目 |
| `DiffView` | 文件变更的并排对比视图 |
| `PermissionPrompt` | 用于批准/拒绝工具权限请求的内联提示框 |
| `LoginDialog` | Agent 认证模态弹窗：支持 env_var 和 terminal 两种认证方式、环境变量表单输入、5 分钟超时 |
| `ConnectionStatus` | 每个 Agent 的连接状态指示器，含 Agent 名称和版本 |
| `UsageBar` | Token 用量进度条，展示上下文窗口消耗 |
| `SessionConfigPanel` | 会话配置项下拉菜单 |
| `CommandPalette` | 可用 Agent 命令的斜杠命令面板 |
| `FileTree` | 按工作区的懒加载文件树，支持展开/折叠、刷新、打开时定位。Props：`cwd`、`onSelectFile`…… |
| `FileViewer` | 面板内文件查看器，支持 Monaco 语法高亮与 `revealLine`。Props：`entries`、`activePath`、`onCloseFile`…… |
| `SkillView` | 技能目录，通过每个已连接 Agent 的 `listSkills()` 实时拉取，按作用域分组，带搜索。Props：`onSelect`、`showSearch`、`emptyText`…… |
| `NewSessionView` | 用于新建会话的落地/输入界面。Props：`onSubmitted`…… |
| `SettingsView` | 全屏设置界面（Appearance + Agents panels）。Props：`activeSection`、`className` |
| `SettingsMenu` | 侧边栏底部下拉菜单，用于打开设置/主题/版本信息 |
| `Select` | 样式化的选择控件，支持 options 与 option 分组 |
| `Dropdown` | 可组合的下拉原语（trigger / content / section / item / submenu） |
| `ResizeHandle` | 可拖拽的调整大小手柄，用于可调整面板 |
| `PlatformProvider` | 注入宿主 `Platform` 并自动挂载 `<PlatformWorkspacesAuto>`、`<PlatformFileTreeAuto>`、`<PlatformFileViewerAuto>`（可用 `autoWorkspaces` / `autoFileTree` / `autoFileViewer` 分别关闭） |

## Hooks

| Hook | 说明 |
|------|-------------|
| `useAcpProvider(opts)` | 创建并管理多 Agent 的 ACP provider 生命周期（连接所有 Agent → 初始化 → 就绪） |
| `useAcpStore(selector)` | 订阅全局 `acpStore`（Zustand vanilla store，通过 `useSyncExternalStore`） |
| `useSessionStore(sessionId, selector)` | 订阅单个会话的 `sessionStore` |
| `useSessions()` | 会话 CRUD：跨工作区列出所有会话、创建、选择、关闭、刷新；返回全局 `activeSessionId` |
| `useWorkspaces()` | 工作区 CRUD：列出、添加、移除工作区（持久化由 `<PlatformWorkspacesAuto>` 处理） |
| `useSessionMessages(sessionId)` | 单会话的消息列表 |
| `useSessionIsStreaming(sessionId)` | 单会话的流式状态 |
| `useSessionPlan(sessionId)` | 单会话的 plan 条目 |
| `useSessionAvailableCommands(sessionId)` | 单会话的可用命令 |
| `useSessionPendingToolCalls(sessionId)` | 单会话的等待中工具调用 |
| `useSessionPendingPermissions(sessionId)` | 单会话的等待中权限请求 |
| `useSessionConfigOptions(sessionId)` | 单会话的配置项 |
| `useSessionUsage(sessionId)` | 单会话的 token 用量 |
| `usePrompt(sessionId)` | 发送消息 `send(blocks)` 和取消 `cancel()`（自动路由到正确的 Agent client） |
| `useToolCalls(sessionId)` | 某会话的等待中和已完成的工具调用 |
| `usePermission(sessionId)` | 当前权限请求，包含 `respond(optionId)` 和 `deny()` 操作 |
| `useConnectionStatus(agentId)` | 指定 Agent 的连接状态、Agent 信息（名称、版本） |
| `useAllAgentStatuses()` | 所有 Agent 的聚合状态：各 Agent 独立状态及整体状态 |
| `useFileTree(cwd)` | 按工作区的文件树状态与操作（展开/折叠/刷新/定位） |
| `useFileViewer()` | 已打开的文件条目、当前激活路径、打开/关闭/定位操作 |
| `useSkills()` | 按 Agent + 作用域分组的技能目录，读取自全局 `skillStore` |
| `useExtensions()` | 扩展方法/通知回调（`onExtMethod` / `onExtNotification`） |
| `useResizable(opts)` | 通用可调整面板状态（宽度、拖拽中、处理函数） |
| `useAcpContext()` | 从 React Context 获取 `getClient(agentId)`、Agent 列表、`addAgent` / `removeAgent`、`builtinAgentIds`、`isReady` |
| `usePlatform()` | 获取宿主 `Platform`（与 `AcpContext` 正交） |
| `useSettings()` | 运行时主题，`theme` / `setTheme()`（底层为 `SettingsContext`） |
| `useI18n()` | 获取 `t()` 翻译函数和 `i18n` 实例 |

## 主题

组件库使用 CSS 自定义属性作为设计令牌契约。所有组件样式仅引用 `--acp-*` 变量——无硬编码颜色值。

通过 `data-acp-theme` 提供两种内置主题：

- `"dark"` — 暗色主题（默认）：深色底色搭配高亮强调色
- `"light"` — 亮色主题：冷白/蓝灰底色搭配色彩强调

`<AcpProvider>` 的 `theme` prop 仅设置**初始**主题；运行时切换通过 `useSettings().setTheme()` 完成，它会将 `data-acp-theme` 同步到 `<body>`，使 portal 组件（Select、dropdown 等）继承这些变量。

可通过覆写变量创建自定义主题：

```css
[data-acp-theme='my-theme'] {
  --acp-color-bg-primary: #ffffff;
  --acp-color-accent: #ff6b6b;
  /* ... 覆写所有需要的变量 */
}
```

```tsx
import { useSettings } from '@acp-components/react';

// 在 <AcpProvider> 内部渲染的组件中
const { theme, setTheme } = useSettings();
setTheme('my-theme');
```

## 国际化（i18n）

基于 i18next 的内置国际化。语言从宿主 `Platform.system.getLocale()` 自动检测（Web：`navigator.language`；桌面：系统语言），可被 `localStorage` 覆盖，默认 `en-US`。

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

使用 `useI18n()` hook 切换语言：

```tsx
const { t, i18n } = useI18n();
i18n.changeLanguage('zh-CN'); // 切换为中文
```

## Platform

`Platform`（定义于 `@acp-components/react`，并从该包重新导出）是环境无关的宿主原生能力契约，与 `AcpContext` **正交**。UI 组件通过 `usePlatform()` 使用它，且绝不直接触碰宿主原生 API（`window.prompt`、`localStorage`、`@tauri-apps/plugin-*` 等）。每个宿主提供自己的实现——参考工厂：`createWebPlatform()`（`examples/demo/src/webPlatform.ts`）与 `createTauriPlatform()`（`examples/tauri/src/tauriPlatform.ts`）。

能力以 slice / 方法是否存在来表达——调用方用 `?.` 守卫：

| Slice | 成员 | 是否必需 |
|-------|---------|----------|
| `storage` | `storage(name?)` → 异步 KV 存储（`workspaces`、`agents`、i18n 均依赖它） | ✅ 始终必需 |
| `fs` | `readDirectory`、`readFileContent`、`writeFileContent?`、`watchFileTree?` | 可选 |
| `dialogs` | `openLink`、`openFilePicker`、`notify` | 可选 |
| `clipboard` | `writeText`、`readText?` | 可选 |
| `openExternalEditor` | `(path, line?) => void` —— 将文件打开委托给宿主，绕过内置 `FileViewer` | 可选 |
| `updater` | `state()`、`check()`、`install()` | 可选 |
| `system` | `getLocale?`、`onLocaleChanged?`、`restart?`、`exportLogs?` | 可选 |
| `process` | `createStdioTransport(opts)` —— 提供 stdio 启动能力，使 `{ type: 'stdio' }` 的 Agent 配置可连接 | 可选（桌面） |

`<PlatformProvider platform={instance}>` 应包裹整棵树，置于 `<I18nProvider>` 与 `<AcpProvider>` 之上。默认自动挂载三个零配置驱动：`<PlatformWorkspacesAuto>`（工作区列表 ↔ `storage('workspaces')`）、`<PlatformFileTreeAuto>`（用 `fs.readDirectory` / `fs.watchFileTree` 驱动 `fileTreeStore`）、`<PlatformFileViewerAuto>`（将 `fs.readFileContent` / `openExternalEditor` 接到 `fileViewerStore`）。可用 `autoWorkspaces={false}` / `autoFileTree={false}` / `autoFileViewer={false}` 分别关闭，改为自行接线。

> `Platform` 只负责宿主原生**能力**；**启动哪个 Agent**（command / args / env）仍作为纯数据放在 `AgentConfig.transport` 上。两者正交——与 `fs.readDirectory`（能力）独立于其调用所用的 `cwd`（数据）是同一模式。

## 框架无关使用方式

`@acp-components/core` 包零 React 依赖，可用于任何框架：

```ts
import { acpStore, sessionStore, fileTreeStore, fileViewerStore, skillStore, createAcpProvider, sendPrompt } from '@acp-components/core';

// 1. 创建多 Agent provider。`stdioFactory` 是宿主的启动能力
//    （如子进程传输）。无法启动进程的宿主传 `null`。
const provider = createAcpProvider(
  {
    agents: [
      { id: 'main', name: '主 Agent', transport: { type: 'stdio', command: 'opencode', args: ['acp'] } },
    ],
  },
  stdioFactory,
);

// 2. 等待就绪
provider.subscribe(() => {
  if (provider.ready) {
    console.log('所有 Agent 已连接！');
  }
});

// 3. 从 vanilla store 读取
acpStore.getState().workspaces;       // 工作区状态树
acpStore.getState().agents;           // Agent 连接状态
fileTreeStore.getState();             // 按工作区的文件树状态
skillStore.getState();                // 技能目录
acpStore.subscribe((state) => { });   // 监听变更

// 4. 使用 actions（需提供 client 和 agentId）
const client = provider.getClient('main');
await sendPrompt(client!, sessionId, blocks);

// 5. 动态添加/移除 Agent
await provider.addAgent({ id: 'analyze', name: '分析 Agent', transport: { type: 'websocket', url: 'ws://...' } });
await provider.removeAgent('analyze');

// 6. 销毁
provider.destroy();
```

## 开发

### 环境要求

- Node.js >= 18
- pnpm
- 一个兼容 ACP 的 Agent（如 [opencode](https://github.com/anthropics/opencode) 的 `acp` 子命令）

### 初始化

```bash
# 安装依赖
pnpm install

# 构建所有包
pnpm build

# 单独构建某个包
pnpm build:core
pnpm build:react

# 运行测试
pnpm test

# Lint
pnpm lint
```

### Web 演示

```bash
# 终端 1 — 启动桥接服务（WebSocket ↔ stdio 代理）
pnpm dev:server

# 或使用 Codex agent 替代 opencode
pnpm dev:server-codex

# 或使用 Claude agent
pnpm dev:server-claude

# 终端 2 — 启动 Vite 开发服务器
pnpm dev
```

演示地址：`http://localhost:5173`

### Tauri 桌面应用

```bash
pnpm dev:tauri      # 开发模式
pnpm build:tauri    # 生产构建
```

### 桥接服务配置

| 变量 | 默认值 | 说明 |
|----------|---------|-------------|
| `ACP_PORT` | `3100` | WebSocket 服务端口 |
| `ACP_HOST` | `127.0.0.1` | WebSocket 服务主机 |
| `ACP_AGENT` | `opencode` | 要启动的 Agent 命令 |
| `ACP_AGENT_ARGS` | `acp` | 传递给 Agent 的参数 |

## 扩展性

### 自定义传输

实现 `AcpTransport` 接口即可接入任意通信层：

```ts
import type { AcpTransport, Stream } from '@acp-components/core';

class MyCustomTransport implements AcpTransport {
  async connect(): Promise<Stream> { /* ... */ }
  disconnect(): void { /* ... */ }
  onClose?: (handler: () => void) => () => void;
  onError?: (handler: (err: Error) => void) => () => void;
}

<AcpProvider agents={[{
  id: 'custom',
  name: '自定义 Agent',
  transport: { type: 'custom', transport: new MyCustomTransport() },
}]}>
```

实际案例：Tauri IPC、Electron IPC、Chrome Extension 消息通信、iframe postMessage。

### 自定义 Platform

实现 `Platform` 接口并通过 `<PlatformProvider platform={instance}>` 注入。提供你的宿主所支持的 slice 即可；`storage` 是唯一始终必需的 slice。参考实现见 `createWebPlatform()` / `createTauriPlatform()`。

### 动态 Agent 管理

Agent 可在运行时动态添加或移除。`useAcpContext()` 暴露的 `addAgent` / `removeAgent` 已包装持久化——它们将用户添加的 Agent 持久化到 `storage('agents')` 并在下次启动时恢复。内置 Agent（来自 `agents` prop）由宿主提供，不可移除：

```tsx
const { addAgent, removeAgent } = useAcpContext();

// 在会话中动态添加 Agent（会被持久化）
await addAgent({
  id: 'new-agent',
  name: '新 Agent',
  transport: { type: 'stdio', command: 'my-agent', args: ['acp'] },
});

// 移除用户添加的 Agent（自动清理其所有会话；内置 Agent 会被拒绝）
await removeAgent('new-agent');
```

### 工作区管理

通过编程方式管理工作区：

```tsx
const { addWorkspace, removeWorkspace, workspaces } = useWorkspaces();

// 添加工作区
addWorkspace('/path/to/project');

// 列出所有工作区
workspaces.forEach(ws => console.log(ws.cwd, ws.sessions.size));
```

### 扩展 Workbench

向 `WorkbenchShell` 注入你自己的导航项 + 主区域视图，向 `SessionView` 注入你自己的侧边栏标签页：

```tsx
<WorkbenchShell
  sessionId={activeSessionId}
  navItems={[
    {
      id: 'terminal',
      label: 'Terminal',
      icon: <TerminalIcon />,
      content: <TerminalView />,
    },
  ]}
/>
```

```tsx
<SessionView
  sessionId={activeSessionId}
  tabs={[{ id: 'terminal', label: 'Terminal', content: <TerminalView /> }]}
/>
```

## 技术栈

| 层级 | 技术 |
|-------|-----------|
| 协议 | `@agentclientprotocol/sdk`（ACP TypeScript SDK） |
| 状态管理 | Zustand v5（vanilla store，无 React 依赖） |
| UI 框架 | React 18 / 19 |
| 代码编辑器 | Monaco（可选 peer 依赖，`FileViewer` 使用） |
| 国际化 | i18next + react-i18next |
| Markdown 渲染 | react-markdown + remark-gfm |
| 图标 | `@ant-design/icons` |
| 样式 | SCSS Modules + CSS 自定义属性 |
| 构建工具 | Vite 6（library mode） |
| 类型系统 | TypeScript 5.6（strict mode） |
| 测试 | Vitest + @testing-library/react + jsdom |
| 包管理器 | pnpm（workspace monorepo） |

## License

MIT
