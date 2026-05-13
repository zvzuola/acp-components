# acp-components

React UI component library for the [Agent Client Protocol (ACP)](https://github.com/agentclientprotocol/sdk), providing a complete set of components to build agentic coding interfaces that communicate with AI agents like Claude Code.

## Features

- **Multi-Transport** — Stdio, HTTP, WebSocket, and custom transports; ships with a Tauri IPC transport example
- **Rich UI Components** — Session list, chat view (with rounds grouping), diff view, terminal view, permission dialog, plan view, thought view, command palette, and more
- **Streaming UX** — Real-time content and thought streaming with typing indicators, tool call status, and usage tracking
- **Session Management** — Create, load, switch, and close sessions with config option support
- **Tool Call Tracking** — Visualize agent tool invocations with status, input/output, file locations, and diffs
- **Permission Handling** — Built-in modal dialog for approving/rejecting tool call permissions
- **Zustand State Management** — Two vanilla Zustand stores: `acpStore` (global state) and `sessionStore` (per-session state)
- **Theming** — Light and dark theme via CSS custom properties and `data-acp-theme` attribute
- **Desktop Ready** — Includes a Tauri example with a custom Tauri IPC transport for native desktop apps

## Packages

| Package | Description |
|---------|-------------|
| [@acp-components/core](packages/core) | Framework-agnostic: transport layer, ACP client, vanilla Zustand stores, and actions |
| [@acp-components/react](packages/react) | React bindings: context provider, hooks, and 15+ UI components |

## Installation

```bash
pnpm add @acp-components/core @acp-components/react
```

**Peer dependencies**: `react` (^18 || ^19), `react-dom` (^18 || ^19)

## Quick Start

```tsx
import ReactDOM from 'react-dom/client';
import { AcpProvider, Workbench, SessionList, ChatView, PermissionDialog } from '@acp-components/react';
import { useAcpStore } from '@acp-components/react';

function App() {
  const activeSessionId = useAcpStore((s) => s.activeSessionId);

  return (
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
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
```

## Transport Options

```tsx
// Stdio — spawn an agent process directly (Electron / Tauri / desktop)
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
| `Workbench` | Three-panel layout (sidebar, main, panel) using CSS grid |
| `ProjectOpener` | Editable project directory display with optional browse button |
| `SessionList` | Sidebar session list with create/select/delete actions |
| `ChatView` | Main chat area: groups messages into user/agent rounds, shows plan, usage bar, and config panel. Props: `sessionId`, `onNavigateFile` |
| `MessageBubble` | Renders message parts (content blocks, thought blocks, tool calls) with markdown via `marked` |
| `ChatComposer` | Text input with command palette integration and send/cancel controls |
| `StreamingIndicator` | Animated typing indicator shown during agent streaming |
| `ToolCallCard` | Displays tool call name, status, input/output, file locations |
| `ThoughtView` | Collapsible view for agent reasoning/thinking content |
| `PlanView` | Displays the agent's plan entries during streaming |
| `DiffView` | Side-by-side diff viewer for file changes |
| `PermissionDialog` | Modal for approving/rejecting tool permission requests |
| `TerminalView` | Embedded terminal output display |
| `ConnectionStatus` | Connection state indicator with agent name |
| `UsageBar` | Token usage bar showing context window consumption |
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
| `usePrompt(sessionId)` | `sendPrompt(blocks)` and `cancelPrompt()` |
| `useToolCalls(sessionId)` | Pending and completed tool calls |
| `usePermission(sessionId)` | Current permission request and `respond`/`deny` actions |
| `useConnectionStatus()` | Connection status and agent info (name, version) |
| `useAcpContext()` | Raw access to `AcpClient`, config, and `projectCwd` from React context |

## Architecture

```
@acp-components/react (React UI)
┌──────────────────────────────────────────────────────────┐
│  Components                                              │
│  AcpProvider ── Workbench ── SessionList                 │
│  ChatView ── MessageBubble ── ToolCallCard               │
│  ChatComposer ── PlanView ── ThoughtView                 │
│  PermissionDialog ── DiffView ── TerminalView            │
│  CommandPalette ── UsageBar ── SessionConfigPanel        │
│  ConnectionStatus ── StreamingIndicator                  │
├──────────────────────────────────────────────────────────┤
│  Hooks (useSyncExternalStore over vanilla stores)        │
│  useAcpProvider ── useSessions ── useSession             │
│  usePrompt ── useToolCalls ── usePermission              │
│  useConnectionStatus ── useAcpStore ── useSessionStore   │
├──────────────────────────────────────────────────────────┤
│  AcpContext                                              │
│  Provides client, config, projectCwd to component tree   │
└──────────────┬───────────────────────────────────────────┘
               │  depends on
┌──────────────▼───────────────────────────────────────────┐
│  @acp-components/core (framework-agnostic)                │
│                                                          │
│  createAcpProvider()  ── wires transport → stores        │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ AcpClient│  │  acpStore    │  │  sessionStore    │   │
│  │          │  │  (vanilla)   │  │  (vanilla)       │   │
│  │ connect  │  │  sessions    │  │  per-session:    │   │
│  │ init     │  │  status      │  │  messages, tc,   │   │
│  │ prompt   │  │  projectCwd  │  │  plan, usage,    │   │
│  │ sessions │  │  activeId    │  │  permissions     │   │
│  └────┬─────┘  └──────────────┘  └──────────────────┘   │
│       │                                                  │
│  ┌────▼─────────────────────────────────────────────┐    │
│  │  Transport Layer                                  │    │
│  │  StdioTransport │ HttpTransport │ WebSocketTransport │ │
│  │  All implement AcpTransport interface             │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  Actions (imperative, operate on client + stores)        │
│  createSession ── loadSession ── selectSession           │
│  closeSession ── refreshSessions ── setSessionConfigOption│
│  sendPrompt ── cancelPrompt                              │
│  respondToPermission ── denyPermission                   │
└──────────────┬───────────────────────────────────────────┘
               │  built on
┌──────────────▼───────────────────────────────────────────┐
│  @agentclientprotocol/sdk  (ACP protocol types & client)  │
│  ClientSideConnection, NDJSON streaming, handshake        │
└──────────────────────────────────────────────────────────┘
```

### Data Flow

1. `AcpProvider` calls `createAcpProvider({ transport, ... })`
2. `createAcpProvider` instantiates the transport, creates an `AcpClient`, and subscribes to `onSessionUpdate`
3. On each session notification from the agent, it dispatches to the appropriate store action:
   - `agent_message_chunk` / `user_message_chunk` → `sessionStore.appendContent()`
   - `agent_thought_chunk` → `sessionStore.appendThought()`
   - `tool_call` → `sessionStore.upsertToolCall()`
   - `tool_call_update` → `sessionStore.updateToolCall()`
   - `plan` → `sessionStore.setPlan()`
   - `usage_update` → `sessionStore.setUsage()`
   - `config_option_update` → `sessionStore.setConfigOptions()`
   - `available_commands_update` → `sessionStore.setAvailableCommands()`
4. React hooks subscribe to the vanilla stores via `useSyncExternalStore` and re-render components

### State Management

Two vanilla Zustand stores (no React dependency):

- **`acpStore`** — Global state: `connectionStatus`, `agentInfo`, `capabilities`, `sessions` (Map), `activeSessionId`, `projectCwd`
- **`sessionStore`** — Per-session state keyed by `SessionId`: `messages[]`, `isStreaming`, `pendingToolCalls` (Map), `stopReason`, `pendingPermissions[]`, `plan[]`, `usage`, `configOptions[]`, `availableCommands[]`

## Project Structure

```
acp-components/
├── packages/
│   ├── core/                    # @acp-components/core
│   │   └── src/
│   │       ├── client/          # AcpClient (wraps ACP ClientSideConnection)
│   │       ├── transport/       # StdioTransport, HttpTransport, WebSocketTransport
│   │       ├── store/           # acpStore, sessionStore (vanilla Zustand)
│   │       ├── actions/         # sessions, prompt, permission
│   │       ├── types/           # Shared TypeScript types
│   │       ├── provider.ts      # createAcpProvider() factory
│   │       └── index.ts
│   └── react/                   # @acp-components/react
│       └── src/
│           ├── components/
│           │   ├── workbench/   # AcpProvider, Workbench, ProjectOpener
│           │   ├── chat-view/   # ChatView, MessageBubble, ChatComposer,
│           │   │                 ToolCallCard, StreamingIndicator,
│           │   │                 ThoughtView, PlanView
│           │   ├── session-list/
│           │   ├── session-config-panel/
│           │   ├── diff-view/
│           │   ├── terminal-view/
│           │   ├── permission-dialog/
│           │   ├── status-bar/  # ConnectionStatus, UsageBar
│           │   └── command-palette/
│           ├── hooks/           # useAcpProvider, useAcpStore, useSessionStore,
│           │                     useSessions, useSession, usePrompt,
│           │                     useToolCalls, usePermission, useConnectionStatus
│           ├── context/         # AcpContext
│           ├── styles.css
│           └── index.ts
├── examples/
│   ├── demo/                    # Vite browser demo (WebSocket transport)
│   ├── server/                  # WebSocket ↔ stdio bridge server
│   └── tauri/                   # Tauri desktop app (TauriIpcTransport)
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

For browser-based development, start the WebSocket bridge server that proxies between the browser and the agent's stdio:

```bash
# Terminal 1 — Start the bridge server
pnpm dev:server

# Terminal 2 — Start the Vite demo
pnpm dev
```

The demo will be available at `http://localhost:5173`.

### Tauri Desktop

```bash
pnpm dev:tauri      # Development mode
pnpm build:tauri    # Production build
```

### Environment Variables (server)

| Variable | Default | Description |
|----------|---------|-------------|
| `ACP_PORT` | `3100` | WebSocket server port |
| `ACP_HOST` | `127.0.0.1` | WebSocket server host |
| `ACP_AGENT` | `opencode` | Agent command to spawn |
| `ACP_AGENT_ARGS` | `acp` | Arguments passed to the agent |

## License

MIT
