# acp-components

React UI component library for the [Agent Client Protocol (ACP)](https://github.com/agentclientprotocol/sdk), providing a complete set of components to build agentic coding interfaces that communicate with AI agents like Claude Code.

## Features

- **Multi-Transport Support** — Connect to agents via Stdio, HTTP, WebSocket, or custom transports
- **Rich UI Components** — Session list, chat view, diff view, terminal view, permission dialog, and more
- **Streaming UX** — Real-time streaming responses with typing indicators and tool call status
- **Session Management** — Create, load, switch between agent sessions with session mode support
- **Tool Call Tracking** — Visualize agent tool invocations, their status, and output in real-time
- **Permission Handling** — Built-in permission request dialog for tool call approvals
- **Zustand State Management** — Lightweight, hook-based store for sessions, messages, and tool calls
- **Theming** — Light and dark theme support out of the box
- **Desktop Ready** — Includes Tauri example for building native desktop applications

## Packages

| Package | Description |
|---------|-------------|
| [@acp-components/core](packages/core) | Transport layer, ACP client, state stores, and React hooks |
| [@acp-components/react](packages/react) | Ready-to-use React UI components |

## Installation

```bash
pnpm add @acp-components/core @acp-components/react
```

**Peer dependencies**: `react` (^18 or ^19)

## Quick Start

```tsx
import ReactDOM from 'react-dom/client';
import { AcpProvider, Workbench, SessionList, ChatView, PermissionDialog } from '@acp-components/react';
import { useAcpStore } from '@acp-components/core';

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
// Stdio — spawn an agent process directly (ideal for Electron/Tauri/desktop)
<AcpProvider transport={{
  type: 'stdio',
  command: 'opencode',
  args: ['acp'],
}}>

// HTTP — connect to an agent over HTTP POST
<AcpProvider transport={{
  type: 'http',
  url: 'http://localhost:8080/acp',
  headers: { 'Authorization': 'Bearer token' },
}}>

// WebSocket — connect to a bridge server (ideal for browser environments)
<AcpProvider transport={{
  type: 'websocket',
  url: 'ws://127.0.0.1:3100',
}}>

// Custom — provide your own transport implementation
<AcpProvider transport={{
  type: 'custom',
  transport: myCustomTransport,
}}>
```

## Components

| Component | Description |
|-----------|-------------|
| `AcpProvider` | Top-level provider that manages ACP connection and provides context |
| `Workbench` | Three-panel layout (sidebar, main, panel) for the agent workspace |
| `SessionList` | Sidebar list of sessions with create/switch functionality |
| `ChatView` | Main chat interface displaying messages and composing prompts |
| `MessageBubble` | Individual message with content blocks and thought indicators |
| `ChatComposer` | Text input area for composing prompts |
| `ToolCallCard` | Displays tool call details, status, and output |
| `StreamingIndicator` | Shows typing/streaming state during agent responses |
| `DiffView` | Side-by-side diff viewer for file changes |
| `PermissionDialog` | Modal dialog for approving/rejecting tool call permissions |
| `TerminalView` | Embedded terminal output display |
| `ConnectionStatus` | Connection state indicator (disconnected/connecting/connected/error) |
| `SessionModeSelector` | Dropdown to switch between session modes |

## Core Hooks

| Hook | Description |
|------|-------------|
| `useSessions()` | List all sessions with metadata |
| `useSession(id)` | Get a single session with messages, streaming state, and tool calls |
| `usePrompt(sessionId)` | Send prompts to the agent and manage the request lifecycle |
| `useToolCalls(sessionId)` | Access pending and completed tool calls for a session |
| `usePermission(sessionId)` | Handle permission requests and responses |
| `useConnectionStatus()` | Subscribe to transport connection status changes |
| `useAcpContext()` | Access the ACP client and configuration from context |
| `useAcpStore()` | Raw access to the global Zustand store |
| `useSessionStore()` | Raw access to the per-session Zustand store |

## Architecture

```
┌─────────────────────────────────────────────────┐
│  @acp-components/react (UI Components)                    │
│  Workbench │ SessionList │ ChatView │ DiffView   │
├─────────────────────────────────────────────────┤
│  @acp-components/core                                     │
│  ┌────────────┐ ┌────────────┐ ┌─────────────┐  │
│  │  Hooks      │ │  Stores    │ │  Transport  │  │
│  │  useSession │ │  acpStore  │ │  Stdio      │  │
│  │  usePrompt  │ │  session   │ │  HTTP       │  │
│  │  useTool... │ │  Store     │ │  WebSocket  │  │
│  └────────────┘ └────────────┘ └─────────────┘  │
│  ┌──────────────────────────────────────────┐    │
│  │  AcpClient (ClientSideConnection)         │    │
│  │  Implements ACP Client role               │    │
│  └──────────────────────────────────────────┘    │
├─────────────────────────────────────────────────┤
│  @agentclientprotocol/sdk                        │
│  Protocol types, NDJSON streaming, handshake     │
└─────────────────────────────────────────────────┘
```

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Start demo app (requires acp-server bridge)
pnpm dev:server   # Start the WebSocket bridge server
pnpm dev          # Start the demo Vite dev server
pnpm dev:all      # Start both server and demo concurrently

# Run tests
pnpm test

# Tauri desktop example
pnpm dev:tauri
pnpm build:tauri
```

### Prerequisites

- Node.js >= 18
- pnpm
- An ACP-compatible agent (e.g., [opencode](https://github.com/anthropics/opencode) with `acp` subcommand)

### Web Demo

For browser-based development, start the WebSocket bridge server that proxies between the browser and the agent's stdio:

```bash
cd examples/server && pnpm dev
```

Then in another terminal:

```bash
pnpm dev
```

The demo will be available at `http://localhost:5173`.

## Project Structure

```
acp-components/
├── packages/
│   ├── core/          # @acp-components/core — transports, client, hooks, stores
│   └── react/         # @acp-components/react — UI components and styles
├── examples/
│   ├── demo/          # Vite-based browser demo
│   ├── server/        # WebSocket ↔ stdio bridge server
│   └── tauri/         # Tauri desktop application example
├── package.json       # Root workspace config
├── pnpm-workspace.yaml
└── tsconfig.json
```


