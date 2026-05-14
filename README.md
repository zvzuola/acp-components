# acp-components

A universal frontend component library for building AI Agent interfaces based on the [Agent Client Protocol (ACP)](https://github.com/agentclientprotocol/sdk). Designed with a **data-layer / UI-layer separation** architecture:

- **`@acp-components/core`** — Framework-agnostic TypeScript module: transport communication, state management, business logic
- **`@acp-components/react`** — React component library: UI rendering and user interaction

You can use the data layer alone to build UI component libraries with Vue, Svelte, or any other frontend framework.

## Features

- **Framework-Agnostic Core** — Zustand vanilla stores with zero React dependency; works with Vue, Svelte, Solid, or vanilla JS
- **Multi-Transport** — Stdio, HTTP, WebSocket, and custom transports out of the box; ships with a Tauri IPC transport example
- **Rich UI Components** — Session list, chat view (with round grouping), diff view, terminal view, permission dialog, plan view, thought view, command palette, and more — 15+ components
- **Streaming UX** — Real-time content and thought streaming with animated indicators, live tool call status, and token usage tracking
- **Session Management** — Full CRUD: create, load, switch, and close sessions with config option support
- **Tool Call Visualization** — Track agent tool invocations with status, input/output, file locations, and diffs
- **Permission Handling** — Promise-based permission flow with built-in modal dialog for approving or rejecting tool call requests
- **Theming** — Dark and light themes via CSS custom properties (`--acp-*` design tokens); extensible via `data-acp-theme` attribute
- **Internationalization** — Built-in i18n support (en-US, zh-CN) via i18next, with custom locale extension
- **Desktop Ready** — Includes Tauri and stdio transport examples for native desktop applications

## Screenshots

### Web Demo

![ACP Web Demo](assets/screenshot-web.png)

### Tauri Desktop

![ACP Tauri Desktop](assets/screenshot-tauri.png)

## Packages

| Package | Description |
|---------|-------------|
| [@acp-components/core](packages/core) | Framework-agnostic: transport layer, AcpClient, vanilla Zustand stores, and imperative actions |
| [@acp-components/react](packages/react) | React bindings: context provider, hooks (useSyncExternalStore), and 15+ UI components |

## Installation

```bash
pnpm add @acp-components/core @acp-components/react
```

**Peer dependencies**: `react` (^18 \|\| ^19), `react-dom` (^18 \|\| ^19)

## Quick Start

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

## Transport Options

```tsx
// Stdio — spawn an agent process directly (Electron / Tauri / Node.js desktop)
<AcpProvider transport={{
  type: 'stdio',
  command: 'opencode',
  args: ['acp'],
}}>

// HTTP — connect via HTTP POST
<AcpProvider transport={{
  type: 'http',
  url: 'http://localhost:8080/acp',
  headers: { 'Authorization': 'Bearer token' },
}}>

// WebSocket — connect to a bridge server (browser environments)
<AcpProvider transport={{
  type: 'websocket',
  url: 'ws://127.0.0.1:3100',
}}>

// Custom — provide your own AcpTransport implementation
<AcpProvider transport={{
  type: 'custom',
  transport: myCustomTransport,
}}>
```

## Components

| Component | Description |
|-----------|-------------|
| `AcpProvider` | Top-level provider: manages connection lifecycle, wires session updates to stores, renders a loading spinner until ready. Props: `transport`, `clientInfo`, `clientCapabilities`, `theme`, `defaultCwd`, `onFileRead`, `onFileWrite` |
| `Workbench` | Three-panel layout (sidebar, main, panel) using CSS Grid |
| `ProjectOpener` | Editable project directory display with browse button |
| `SessionList` | Sidebar session list with create / select / delete actions |
| `ChatView` | Main chat area: groups messages into user/agent rounds, renders plan, usage bar, and config panel. Props: `sessionId`, `onNavigateFile` |
| `MessageBubble` | Renders message parts (content blocks, thought blocks, tool calls) with Markdown via `marked` |
| `ChatComposer` | Text input with slash-command palette integration and send / cancel controls |
| `StreamingIndicator` | Animated typing indicator shown during agent streaming |
| `ToolCallCard` | Displays tool call name, status, input/output, file locations |
| `ThoughtView` | Collapsible view for agent reasoning / thinking content |
| `PlanView` | Displays the agent's plan entries during streaming |
| `DiffView` | Side-by-side diff viewer for file changes |
| `PermissionDialog` | Modal for approving / rejecting tool permission requests |
| `TerminalView` | Embedded terminal output display |
| `ConnectionStatus` | Connection state indicator with agent name and version |
| `UsageBar` | Token usage progress bar showing context window consumption |
| `SessionConfigPanel` | Dropdown for session configuration options |
| `CommandPalette` | Slash-command palette for available agent commands |

## Hooks

| Hook | Description |
|------|-------------|
| `useAcpProvider(opts)` | Creates and manages the ACP provider lifecycle (connect → initialize → ready) |
| `useAcpStore(selector)` | Subscribe to the global `acpStore` (Zustand vanilla store via `useSyncExternalStore`) |
| `useSessionStore(sessionId, selector)` | Subscribe to per-session `sessionStore` |
| `useSessions()` | Session CRUD: list, create, select, close, refresh, plus `activeSessionId` |
| `useSession(sessionId)` | All data for one session: messages, streaming state, tool calls, permissions, plan, usage, config options, available commands |
| `usePrompt(sessionId)` | `send(blocks)` and `cancel()` for sending / canceling prompts |
| `useToolCalls(sessionId)` | Pending and completed tool calls for a session |
| `usePermission(sessionId)` | Current permission request with `respond(optionId)` and `deny()` actions |
| `useConnectionStatus()` | Connection status, agent info (name, version) |
| `useAcpContext()` | Raw access to `AcpClient`, config, and `projectCwd` from React context |
| `useI18n()` | Access to `t()` translation function and `i18n` instance |

## Architecture

### Package Layering

```
┌──────────────────────────────────────────────────────┐
│               Application Layer                       │
│  Vite Demo / Tauri Desktop / Custom Apps              │
└────────────────────┬─────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────┐
│          UI Layer: @acp-components/react               │
│  ┌────────────────────────────────────────────────┐  │
│  │  Components (15+)                              │  │
│  │  Workbench  ChatView  SessionList  DiffView    │  │
│  │  PermissionDialog  CommandPalette  ...         │  │
│  ├────────────────────────────────────────────────┤  │
│  │  Hooks (useSyncExternalStore)                  │  │
│  │  useAcpStore  useSession  usePrompt  ...       │  │
│  ├────────────────────────────────────────────────┤  │
│  │  AcpContext + I18nProvider                     │  │
│  ├────────────────────────────────────────────────┤  │
│  │  Theme System (CSS Custom Properties)          │  │
│  │  --acp-color-*  --acp-shadow-*  --acp-radius-*│  │
│  └────────────────────────────────────────────────┘  │
└────────────────────┬─────────────────────────────────┘
                     │  depends on
┌────────────────────▼─────────────────────────────────┐
│        Data Layer: @acp-components/core               │
│  ┌────────────────────────────────────────────────┐  │
│  │  AcpClient                                     │  │
│  │  connect / initialize / prompt / cancel         │  │
│  │  session CRUD / setSessionConfigOption          │  │
│  │  onSessionUpdate / setPermissionHandler         │  │
│  ├────────────────────────────────────────────────┤  │
│  │  Transport Layer                                │  │
│  │  StdioTransport │ HttpTransport                 │  │
│  │  WebSocketTransport │ Custom (AcpTransport)     │  │
│  ├────────────────────────────────────────────────┤  │
│  │  State Management (vanilla Zustand)             │  │
│  │  acpStore — global state                       │  │
│  │  sessionStore — per-session state               │  │
│  ├────────────────────────────────────────────────┤  │
│  │  Actions (imperative)                          │  │
│  │  sessions / prompt / permission                │  │
│  ├────────────────────────────────────────────────┤  │
│  │  createAcpProvider() — lifecycle orchestrator  │  │
│  │  wires transport → AcpClient → stores          │  │
│  └────────────────────────────────────────────────┘  │
└────────────────────┬─────────────────────────────────┘
                     │  built on
┌────────────────────▼─────────────────────────────────┐
│       @agentclientprotocol/sdk  (ACP Protocol)        │
│  ClientSideConnection / NDJSON streaming / handshake  │
└──────────────────────────────────────────────────────┘
```

### Data Flow

ACP supports bidirectional communication between Client and Agent. Within the frontend, state management follows a unidirectional cycle:

```
Agent (sessionUpdate via NDJSON stream)
    ↓ Transport.readable
AcpClient.onSessionUpdate event
    ↓
createAcpProvider dispatches to stores
    ↓
acpStore / sessionStore (Zustand vanilla)
    ↓ useSyncExternalStore
React Hooks → Components (re-render)
    ↓ user action
Actions (operate on client + stores)
    ↓ ACP protocol messages
AcpClient.prompt() / cancel() → Transport.writable → Agent
```

**SessionUpdate dispatch mapping:**

| SessionUpdate Type | Store Action |
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

### State Management

Two vanilla Zustand stores (no React dependency):

- **`acpStore`** — Global state: `connectionStatus`, `agentInfo`, `capabilities`, `sessions` (Map), `activeSessionId`, `projectCwd`
- **`sessionStore`** — Per-session data keyed by `SessionId`: `messages[]`, `isStreaming`, `pendingToolCalls` (Map), `stopReason`, `pendingPermissions[]`, `plan[]`, `usage`, `configOptions[]`, `availableCommands[]`

### Permission Flow

Agent tool call requests are Promise-wrapped by the provider and exposed to the UI:

```
Agent → requestPermission(params)
    ↓
AcpClient.permissionHandler = () => new Promise(...)
    ↓
sessionStore.addPermissionRequest(sessionId, req)
    ↓
PermissionDialog displays the request
    ↓
User clicks Allow → respondToPermission(id, optionId)
    │     └→ req.resolve(optionId) → Promise resolved
User clicks Deny  → denyPermission(id)
          └→ req.reject() → Promise resolved
```

## Theming

The component library uses CSS custom properties as a design-token contract. All component styles reference only `--acp-*` variables — no hardcoded color values.

Two built-in themes via `data-acp-theme`:

- `"dark"` — "Warp" dark theme (default): deep navy background with cyan electric accents
- `"light"` — "Frost" light theme: cool white / blue-gray surfaces with cyan accents

Create custom themes by overriding the variables:

```css
[data-acp-theme='my-theme'] {
  --acp-color-bg-primary: #ffffff;
  --acp-color-accent: #ff6b6b;
  /* ... override all needed variables */
}
```

```tsx
<AcpProvider theme="my-theme" transport={...}>
```

## Internationalization (i18n)

Built-in i18n via i18next with auto-detection (`localStorage` → `navigator.language` → `defaultLocale`).

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

Use the `useI18n()` hook for language switching:

```tsx
const { t, i18n } = useI18n();
i18n.changeLanguage('zh-CN'); // switch to Chinese
```

## Framework-Agnostic Usage

The `@acp-components/core` package has zero React dependency. You can use it with any framework:

```ts
import { acpStore, sessionStore, createAcpProvider, sendPrompt } from '@acp-components/core';

// 1. Create provider
const provider = createAcpProvider({
  transport: { type: 'stdio', command: 'opencode', args: ['acp'] },
});

// 2. Wait for ready
provider.subscribe(() => {
  if (provider.ready) {
    console.log('Connected!');
  }
});

// 3. Read from vanilla stores
acpStore.getState().sessions;       // current sessions
acpStore.subscribe((state) => { }); // watch for changes

// 4. Use actions
await sendPrompt(provider.client, sessionId, blocks);
```

## Project Structure

```
acp-components/
├── packages/
│   ├── core/                    # @acp-components/core (framework-agnostic)
│   │   └── src/
│   │       ├── client/          # AcpClient — wraps ACP ClientSideConnection
│   │       ├── transport/       # StdioTransport, HttpTransport, WebSocketTransport
│   │       ├── store/           # acpStore, sessionStore (vanilla Zustand)
│   │       ├── actions/         # sessions.ts, prompt.ts, permission.ts
│   │       ├── types/           # Shared TypeScript types
│   │       ├── provider.ts      # createAcpProvider() factory
│   │       └── index.ts
│   └── react/                   # @acp-components/react (React UI)
│       └── src/
│           ├── components/
│           │   ├── workbench/    # AcpProvider, Workbench, ProjectOpener
│           │   ├── chat-view/    # ChatView, MessageBubble, ChatComposer,
│           │   │                  ToolCallCard, StreamingIndicator, ThoughtView, PlanView
│           │   ├── session-list/
│           │   ├── session-config-panel/
│           │   ├── diff-view/
│           │   ├── terminal-view/
│           │   ├── permission-dialog/
│           │   ├── status-bar/   # ConnectionStatus, UsageBar
│           │   └── command-palette/
│           ├── hooks/            # useAcpProvider, useAcpStore, useSessionStore,
│           │                      useSessions, useSession, usePrompt,
│           │                      useToolCalls, usePermission, useConnectionStatus
│           ├── context/          # AcpContext
│           ├── i18n/             # I18nProvider, useI18n, en-US / zh-CN locales
│           ├── styles/           # themes.scss, styles.css
│           └── index.ts
├── examples/
│   ├── demo/                    # Vite browser demo (WebSocket transport)
│   ├── server/                  # WebSocket ↔ stdio bridge server
│   └── tauri/                   # Tauri desktop app (custom TauriIpcTransport)
├── package.json                 # Root workspace config
├── pnpm-workspace.yaml
└── tsconfig.json
```

## Development

### Prerequisites

- Node.js >= 18
- pnpm
- An ACP-compatible agent (e.g., [opencode](https://github.com/anthropics/opencode) with `acp` subcommand)

### Setup

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Build individual packages
pnpm build:core
pnpm build:react

# Run tests
pnpm test
```

### Web Demo

```bash
# Terminal 1 — Start the bridge server (WebSocket ↔ stdio proxy)
pnpm dev:server

# Terminal 2 — Start the Vite dev server
pnpm dev
```

The demo will be available at `http://localhost:5173`.

### Tauri Desktop

```bash
pnpm dev:tauri      # Development mode
pnpm build:tauri    # Production build
```

### Bridge Server Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ACP_PORT` | `3100` | WebSocket server port |
| `ACP_HOST` | `127.0.0.1` | WebSocket server host |
| `ACP_AGENT` | `opencode` | Agent command to spawn |
| `ACP_AGENT_ARGS` | `acp` | Arguments passed to the agent |

## Extensibility

### Custom Transport

Implement the `AcpTransport` interface to add any communication layer:

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

Real-world examples: Tauri IPC, Electron IPC, Chrome Extension messaging, iframe postMessage.

### File System Integration

Control how the agent reads and writes files:

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

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Protocol | `@agentclientprotocol/sdk` (ACP TypeScript SDK) |
| State Management | Zustand v5 (vanilla store, no React dependency) |
| UI Framework | React 18 / 19 |
| Internationalization | i18next + react-i18next |
| Markdown Rendering | marked |
| Styling | SCSS Modules + CSS Custom Properties |
| Build Tool | Vite 6 (library mode) |
| Type System | TypeScript 5.6 (strict mode) |
| Testing | Vitest + @testing-library/react + jsdom |
| Package Manager | pnpm (workspace monorepo) |

## License

MIT
