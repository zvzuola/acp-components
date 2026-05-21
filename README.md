# acp-components

A universal frontend component library for building AI Agent interfaces based on the [Agent Client Protocol (ACP)](https://github.com/agentclientprotocol/agent-client-protocol). Designed with a **data-layer / UI-layer separation** architecture:

- **`@acp-components/core`** — Framework-agnostic TypeScript module: transport communication, state management, business logic
- **`@acp-components/react`** — React component library: UI rendering and user interaction

You can use the data layer alone to build UI component libraries with Vue, Svelte, or any other frontend framework.

## Features

- **Multi-Agent** — Connect to multiple ACP agents simultaneously, each with independent transport, capabilities, and session management
- **Multi-Workspace** — Organize sessions by working directory (cwd); switch between workspaces seamlessly
- **Framework-Agnostic Core** — Zustand vanilla stores with zero React dependency; works with Vue, Svelte, Solid, or vanilla JS
- **Multi-Transport** — Stdio, HTTP, WebSocket, and custom transports per agent; ships with a Tauri IPC transport example
- **Rich UI Components** — Session list (grouped by agent), chat view (with round grouping), diff view, terminal view, permission dialog, plan view, thought view, command palette, workspace switcher, and more — 15+ components
- **Streaming UX** — Real-time content and thought streaming with animated indicators, live tool call status, and token usage tracking
- **Session Management** — Full CRUD: create, load, switch, and close sessions scoped by workspace and agent
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
| [@acp-components/core](packages/core) | Framework-agnostic: multi-agent transport layer, AcpClient, vanilla Zustand stores (workspace + agent + session), and imperative actions |
| [@acp-components/react](packages/react) | React bindings: context provider, hooks (useSyncExternalStore), and 15+ UI components |

## Installation

```bash
pnpm add @acp-components/core @acp-components/react
```

**Peer dependencies**: `react` (^18 || ^19), `react-dom` (^18 || ^19)

## Quick Start

```tsx
import ReactDOM from 'react-dom/client';
import {
  I18nProvider,
  AcpProvider,
  Workbench,
  ProjectOpener,
  SessionList,
  ChatView,
  PermissionDialog,
} from '@acp-components/react';
import { useAcpStore, useSessions } from '@acp-components/react';

function App() {
  const activeSessionId = useAcpStore((s) => {
    if (!s.activeWorkspaceCwd) return null;
    return s.workspaces.get(s.activeWorkspaceCwd)?.activeSessionId ?? null;
  });

  return (
    <I18nProvider>
      <AcpProvider
        agents={[
          {
            id: 'main',
            name: 'Main Agent',
            transport: { type: 'websocket', url: 'ws://127.0.0.1:3100' },
          },
        ]}
        theme="dark"
        defaultCwd="/path/to/project"
      >
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
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
```

### Multi-Agent Example

Connect to multiple agents in different modes simultaneously:

```tsx
<AcpProvider
  agents={[
    {
      id: 'craft',
      name: 'Craft Agent',
      transport: { type: 'websocket', url: 'ws://127.0.0.1:3100' },
      clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } },
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

## Transport Options

Each agent in the `agents` array gets its own transport configuration:

```tsx
// Stdio — spawn an agent process directly (Electron / Tauri / Node.js desktop)
{
  id: 'desktop-agent',
  name: 'Desktop',
  transport: { type: 'stdio', command: 'opencode', args: ['acp'] },
}

// HTTP — connect via HTTP POST
{
  id: 'http-agent',
  name: 'HTTP',
  transport: { type: 'http', url: 'http://localhost:8080/acp', headers: { 'Authorization': 'Bearer token' } },
}

// WebSocket — connect to a bridge server (browser environments)
{
  id: 'ws-agent',
  name: 'WebSocket',
  transport: { type: 'websocket', url: 'ws://127.0.0.1:3100' },
}

// Custom — provide your own AcpTransport implementation
{
  id: 'custom-agent',
  name: 'Custom',
  transport: { type: 'custom', transport: myCustomTransport },
}
```

## Components

| Component | Description |
|-----------|-------------|
| `AcpProvider` | Top-level provider: connects to multiple agents in parallel, manages agent lifecycle, wires session updates to stores, renders a loading spinner until all agents are ready. Props: `agents`, `theme`, `defaultCwd`, `onFileRead`, `onFileWrite` |
| `Workbench` | Three-panel layout (sidebar, main, panel) using CSS Grid |
| `ProjectOpener` | Editable workspace directory display with dropdown to switch between active workspaces |
| `SessionList` | Sidebar session list grouped by agent within the active workspace, with create / select / delete actions per agent |
| `ChatView` | Main chat area: groups messages into user/agent rounds, renders plan, usage bar, and config panel. Props: `sessionId`, `onNavigateFile` |
| `MessageBubble` | Renders message parts (content blocks, thought blocks, tool calls) with Markdown via `react-markdown` |
| `ChatComposer` | Text input with slash-command palette integration and send / cancel controls |
| `StreamingIndicator` | Animated typing indicator shown during agent streaming |
| `ToolCallCard` | Displays tool call name, status, input/output, file locations |
| `ThoughtView` | Collapsible view for agent reasoning / thinking content |
| `PlanView` | Displays the agent's plan entries during streaming |
| `DiffView` | Side-by-side diff viewer for file changes |
| `PermissionDialog` | Modal for approving / rejecting tool permission requests |
| `TerminalView` | Embedded terminal output display |
| `ConnectionStatus` | Per-agent connection state indicator with agent name and version |
| `UsageBar` | Token usage progress bar showing context window consumption |
| `SessionConfigPanel` | Dropdown for session configuration options |
| `CommandPalette` | Slash-command palette for available agent commands |

## Hooks

| Hook | Description |
|------|-------------|
| `useAcpProvider(opts)` | Creates and manages the multi-agent ACP provider lifecycle (connect all agents → initialize → ready) |
| `useAcpStore(selector)` | Subscribe to the global `acpStore` (Zustand vanilla store via `useSyncExternalStore`) |
| `useSessionStore(sessionId, selector)` | Subscribe to per-session `sessionStore` |
| `useSessions()` | Workspace-scoped session CRUD: list, create, select, close, refresh for the active workspace; returns `activeSessionId` |
| `useSession(sessionId)` | All data for one session: messages, streaming state, tool calls, permissions, plan, usage, config options, available commands |
| `usePrompt(sessionId)` | `send(blocks)` and `cancel()` for sending / canceling prompts (auto-resolves the correct agent client) |
| `useToolCalls(sessionId)` | Pending and completed tool calls for a session |
| `usePermission(sessionId)` | Current permission request with `respond(optionId)` and `deny()` actions |
| `useConnectionStatus(agentId)` | Per-agent connection status, agent info (name, version) |
| `useAllAgentStatuses()` | Aggregate status across all agents: individual statuses plus overall status |
| `useAcpContext()` | Raw access to `getClient(agentId)`, agents list, workspaces, and workspace management actions from React context |
| `useI18n()` | Access to `t()` translation function and `i18n` instance |

## Architecture

### Multi-Agent & Multi-Workspace Model

The component library supports connecting to multiple ACP agents simultaneously and organizing sessions by workspace (working directory):

```
┌──────────────────────────────────────────────────────────────┐
│                      acpStore (Global State)                  │
│                                                              │
│  agents: Map<agentId, AgentConnection>                       │
│  ┌──────────┬──────────┬──────────┐                         │
│  │ craft    │ ask      │ code     │   (parallel connections) │
│  │ (ws://)  │ (stdio)  │ (http)   │                         │
│  └──────────┴──────────┴──────────┘                         │
│                                                              │
│  workspaces: Map<cwd, WorkspaceState>                        │
│  ┌─────────────────────────────────────┐                    │
│  │ /projects/app                       │                    │
│  │  ├─ craft → [session-1, session-2]  │                    │
│  │  └─ ask   → [session-3]             │                    │
│  ├─────────────────────────────────────┤                    │
│  │ /projects/lib                       │                    │
│  │  └─ code  → [session-4]             │                    │
│  └─────────────────────────────────────┘                    │
│                                                              │
│  activeWorkspaceCwd: "/projects/app"                         │
└──────────────────────────────────────────────────────────────┘
```

- **Workspace** — Identified by `cwd` (current working directory). Each workspace holds sessions from different agents. Switching workspaces filters the session list to that directory's context.
- **Agent** — An independent ACP connection with its own transport, client info, capabilities, and status. Agents connect in parallel when the provider initializes.
- **Session** — Belongs to a specific workspace + agent pair. The `SessionMeta` carries `agentId` and `cwd` for routing.

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
│  │  ProjectOpener  PermissionDialog  ...          │  │
│  ├────────────────────────────────────────────────┤  │
│  │  Hooks (useSyncExternalStore)                  │  │
│  │  useAcpProvider  useSessions  usePrompt  ...   │  │
│  ├────────────────────────────────────────────────┤  │
│  │  AcpContext + I18nProvider                     │  │
│  │  (multi-agent: getClient(agentId), agents[])   │  │
│  ├────────────────────────────────────────────────┤  │
│  │  Theme System (CSS Custom Properties)          │  │
│  │  --acp-color-*  --acp-shadow-*  --acp-radius-*│  │
│  └────────────────────────────────────────────────┘  │
└────────────────────┬─────────────────────────────────┘
                     │  depends on
┌────────────────────▼─────────────────────────────────┐
│        Data Layer: @acp-components/core               │
│  ┌────────────────────────────────────────────────┐  │
│  │  Multi-Agent Provider                           │  │
│  │  createAcpProvider({ agents, onFileRead, ... })│  │
│  │  → parallel connect → initialize → ready       │  │
│  │  addAgent / removeAgent / getClient              │  │
│  ├────────────────────────────────────────────────┤  │
│  │  AcpClient (per agent)                          │  │
│  │  connect / initialize / prompt / cancel         │  │
│  │  session CRUD / setSessionConfigOption          │  │
│  │  onSessionUpdate / setPermissionHandler         │  │
│  ├────────────────────────────────────────────────┤  │
│  │  Transport Layer (per agent)                    │  │
│  │  StdioTransport │ HttpTransport                 │  │
│  │  WebSocketTransport │ Custom (AcpTransport)     │  │
│  ├────────────────────────────────────────────────┤  │
│  │  State Management (vanilla Zustand)             │  │
│  │  acpStore — agents, workspaces, sessions        │  │
│  │  sessionStore — per-session data                │  │
│  ├────────────────────────────────────────────────┤  │
│  │  Actions (imperative, agent-aware)              │  │
│  │  sessions / prompt / permission                 │  │
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
AcpClient.onSessionUpdate event (per agent)
    ↓
createAcpProvider dispatches to stores
    ↓
acpStore / sessionStore (Zustand vanilla)
    ↓ useSyncExternalStore
React Hooks → Components (re-render)
    ↓ user action
Actions (operate on client + stores, route to correct agent)
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

- **`acpStore`** — Global state:
  - `agents: Map<agentId, AgentConnection>` — all connected agents with status, info, capabilities
  - `workspaces: Map<cwd, WorkspaceState>` — workspaces each containing their own `sessions` (Map of `SessionMeta`) and `activeSessionId`
  - `activeWorkspaceCwd: string | null` — currently selected workspace
- **`sessionStore`** — Per-session data keyed by `SessionId`: `messages[]`, `isStreaming`, `pendingToolCalls` (Map), `stopReason`, `pendingPermissions[]`, `plan[]`, `usage`, `configOptions[]`, `availableCommands[]`

### Workspace Lifecycle

```
User opens project dir → addWorkspace(cwd) → setActiveWorkspace(cwd)
    → Provider auto-fetches sessions from all agents for that cwd
    → SessionList renders sessions grouped by agent

User switches workspace → setActiveWorkspace(otherCwd)
    → Provider fetches sessions for new cwd (cached if already loaded)
    → activeSessionId resets to null for workspace switch

User closes workspace → removeWorkspace(cwd)
    → All sessions in that workspace are cleaned up
    → Active workspace falls back to next available or null
```

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

- `"dark"` — Dark theme (default): deep navy background with accent highlights
- `"light"` — Light theme: cool white / blue-gray surfaces with color accents

Create custom themes by overriding the variables:

```css
[data-acp-theme='my-theme'] {
  --acp-color-bg-primary: #ffffff;
  --acp-color-accent: #ff6b6b;
  /* ... override all needed variables */
}
```

```tsx
<AcpProvider theme="my-theme" agents={[...]}>
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

// 1. Create multi-agent provider
const provider = createAcpProvider({
  agents: [
    { id: 'main', name: 'Main', transport: { type: 'stdio', command: 'opencode', args: ['acp'] } },
  ],
});

// 2. Wait for ready
provider.subscribe(() => {
  if (provider.ready) {
    console.log('All agents connected!');
  }
});

// 3. Read from vanilla stores
acpStore.getState().workspaces;       // workspace state tree
acpStore.getState().agents;           // agent connection statuses
acpStore.subscribe((state) => { });   // watch for changes

// 4. Use actions (need to provide client and agentId)
const client = provider.getClient('main');
await sendPrompt(client!, sessionId, blocks);

// 5. Add/remove agents dynamically
await provider.addAgent({ id: 'analyze', name: 'Analyze', transport: { type: 'websocket', url: 'ws://...' } });
await provider.removeAgent('analyze');
```

## Project Structure

```
acp-components/
├── packages/
│   ├── core/                    # @acp-components/core (framework-agnostic)
│   │   └── src/
│   │       ├── client/          # AcpClient — wraps ACP ClientSideConnection (per agent)
│   │       ├── transport/       # StdioTransport, HttpTransport, WebSocketTransport
│   │       ├── store/           # acpStore (agents, workspaces, sessions), sessionStore (vanilla Zustand)
│   │       ├── actions/         # sessions.ts, prompt.ts, permission.ts (agent-aware)
│   │       ├── types/           # Shared TypeScript types (AgentConfig, WorkspaceState, AgentConnection, etc.)
│   │       ├── provider.ts      # createAcpProvider() — multi-agent lifecycle orchestrator
│   │       └── index.ts
│   └── react/                   # @acp-components/react (React UI)
│       └── src/
│           ├── components/
│           │   ├── workbench/    # AcpProvider, Workbench, ProjectOpener
│           │   ├── chat-view/    # ChatView, MessageBubble, ChatComposer,
│           │   │                  ToolCallCard, StreamingIndicator, ThoughtView, PlanView
│           │   ├── session-list/ # Agent-grouped session list
│           │   ├── session-config-panel/
│           │   ├── diff-view/
│           │   ├── terminal-view/
│           │   ├── permission-dialog/
│           │   ├── status-bar/   # ConnectionStatus, UsageBar
│           │   ├── command-palette/
│           │   ├── workspace-dialog/
│           │   ├── workspace-list/
│           │   └── project-switcher/
│           ├── hooks/            # useAcpProvider, useAcpStore, useSessionStore,
│           │                      useSessions, useSession, usePrompt,
│           │                      useToolCalls, usePermission, useConnectionStatus,
│           │                      useAllAgentStatuses
│           ├── context/          # AcpContext (multi-agent aware)
│           ├── i18n/             # I18nProvider, useI18n, en-US / zh-CN locales
│           ├── styles/           # themes.scss, styles.css
│           └── index.ts
├── examples/
│   ├── demo/                    # Vite browser demo (WebSocket transport)
│   ├── server/                  # WebSocket ↔ stdio bridge server
│   └── tauri/                   # Tauri desktop app (custom TauriIpcTransport)
├── docs/
│   ├── ARCHITECTURE.md          # Detailed architecture documentation
│   └── DETAILED_DESIGN.md       # Detailed design specs
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

<AcpProvider agents={[{
  id: 'custom',
  name: 'Custom Agent',
  transport: { type: 'custom', transport: new MyCustomTransport() },
}]}>
```

Real-world examples: Tauri IPC, Electron IPC, Chrome Extension messaging, iframe postMessage.

### Dynamic Agent Management

Agents can be added or removed at runtime:

```tsx
const { addAgent, removeAgent } = useAcpContext();

// Add a new agent mid-session
await addAgent({
  id: 'new-agent',
  name: 'New Agent',
  transport: { type: 'stdio', command: 'my-agent', args: ['acp'] },
});

// Remove an agent (cleans up its sessions automatically)
await removeAgent('new-agent');
```

### File System Integration

Control how agents read and write files:

```tsx
<AcpProvider
  agents={[...]}
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

### Workspace Management

Programmatically manage workspaces:

```tsx
const { addWorkspace, setActiveWorkspace, removeWorkspace, workspaces } = useAcpContext();

// Add a workspace
addWorkspace('/path/to/project');

// Switch to it
setActiveWorkspace('/path/to/project');

// List all workspaces
workspaces.forEach(ws => console.log(ws.cwd, ws.sessions.size));
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Protocol | `@agentclientprotocol/sdk` (ACP TypeScript SDK) |
| State Management | Zustand v5 (vanilla store, no React dependency) |
| UI Framework | React 18 / 19 |
| Internationalization | i18next + react-i18next |
| Markdown Rendering | react-markdown |
| Styling | SCSS Modules + CSS Custom Properties |
| Build Tool | Vite 6 (library mode) |
| Type System | TypeScript 5.6 (strict mode) |
| Testing | Vitest + @testing-library/react + jsdom |
| Package Manager | pnpm (workspace monorepo) |

## License

MIT
