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
- **Rich UI Components** — Workspace & session list (grouped by directory then agent), chat view (with round grouping), diff view, permission dialog, plan view, thought view, command palette, login dialog, and more — 15+ components
- **Streaming UX** — Real-time content and thought streaming with animated indicators, live tool call status, and token usage tracking
- **Session Management** — Full CRUD: create, load, switch, and close sessions scoped by workspace and agent
- **Tool Call Visualization** — Track agent tool invocations with status, input/output, file locations, and diffs
- **Authentication** — Built-in auth flow with `LoginDialog` component, env_var and terminal-based auth methods, and programmatic `authenticate`/`authenticateWithEnv` actions
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
  PlatformProvider,
  AcpProvider,
  Workbench,
  SessionList,
  ChatView,
  PermissionDialog,
  LoginDialog,
} from '@acp-components/react';
import { useAcpStore } from '@acp-components/react';
// createWebPlatform is a host-side factory; the demo ships one in
// examples/demo/src/webPlatform.ts. Implement your own for a custom host.
import { createWebPlatform } from './webPlatform';

function App() {
  const activeSessionId = useAcpStore((s) => s.activeSessionId);

  return (
    <PlatformProvider platform={createWebPlatform()}>
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
                {/* Directory picking is now driven by usePlatform().openDirectoryPickerDialog()
                    inside SessionList — no onBrowse prop needed. */}
                <SessionList />
              </>
            }
            main={<ChatView sessionId={activeSessionId} />}
          />
          <PermissionDialog sessionId={activeSessionId} />
          <LoginDialog />
        </AcpProvider>
      </I18nProvider>
    </PlatformProvider>
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
| `AcpProvider` | Top-level provider: connects to multiple agents in parallel, manages agent lifecycle, wires session updates to stores, renders a loading spinner until all agents are ready. Props: `agents`, `theme`, `defaultCwd`, `onExtMethod`, `onExtNotification` |
| `Workbench` | Three-panel layout (sidebar, main, panel) using CSS Grid |
| `SessionList` | Sidebar workspace & session list: workspaces grouped by directory, sessions grouped by agent within each workspace, with add workspace / create / select / delete actions |
| `ChatView` | Main chat area: groups messages into user/agent rounds, renders plan, usage bar, and config panel. Props: `sessionId`, `onNavigateFile` |
| `MessageBubble` | Renders message parts (content blocks, thought blocks, tool calls) with Markdown via `react-markdown` |
| `Markdown` | Reusable Markdown renderer with syntax-highlighted code blocks and GFM support |
| `ChatComposer` | Text input with slash-command palette integration and send / cancel controls |
| `StreamingIndicator` | Animated typing indicator shown during agent streaming |
| `ToolCallCard` | Displays tool call name, status, input/output, file locations |
| `ThoughtView` | Collapsible view for agent reasoning / thinking content |
| `PlanView` | Displays the agent's plan entries during streaming |
| `DiffView` | Side-by-side diff viewer for file changes |
| `PermissionDialog` | Modal for approving / rejecting tool permission requests |
| `LoginDialog` | Modal for agent authentication: supports env_var and terminal-based auth methods, env var form input, 5-minute timeout |
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
| `useSessions()` | Session CRUD: list all sessions across workspaces, create, select, close, refresh; returns global `activeSessionId` |
| `useSessionMessages(sessionId)` | Messages for one session |
| `useSessionIsStreaming(sessionId)` | Streaming state for one session |
| `useSessionPlan(sessionId)` | Plan entries for one session |
| `useSessionAvailableCommands(sessionId)` | Available commands for one session |
| `useSessionPendingToolCalls(sessionId)` | Pending tool calls for one session |
| `useSessionPendingPermissions(sessionId)` | Pending permission requests for one session |
| `useSessionConfigOptions(sessionId)` | Config options for one session |
| `useSessionUsage(sessionId)` | Token usage for one session |
| `usePrompt(sessionId)` | `send(blocks)` and `cancel()` for sending / canceling prompts (auto-resolves the correct agent client) |
| `useToolCalls(sessionId)` | Pending and completed tool calls for a session |
| `usePermission(sessionId)` | Current permission request with `respond(optionId)` and `deny()` actions |
| `useConnectionStatus(agentId)` | Per-agent connection status, agent info (name, version) |
| `useAllAgentStatuses()` | Aggregate status across all agents: individual statuses plus overall status |
| `useAcpContext()` | Raw access to `getClient(agentId)`, agents list, workspaces, and workspace management actions from React context |
| `useI18n()` | Access to `t()` translation function and `i18n` instance |

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

# Or use Codex agent instead of opencode
pnpm dev:server-codex

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

### Workspace Management

Programmatically manage workspaces:

```tsx
const { addWorkspace, removeWorkspace, workspaces } = useAcpContext();

// Add a workspace
addWorkspace('/path/to/project');

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
| Markdown Rendering | react-markdown + remark-gfm |
| Styling | SCSS Modules + CSS Custom Properties |
| Build Tool | Vite 6 (library mode) |
| Type System | TypeScript 5.6 (strict mode) |
| Testing | Vitest + @testing-library/react + jsdom |
| Package Manager | pnpm (workspace monorepo) |

## License

MIT
