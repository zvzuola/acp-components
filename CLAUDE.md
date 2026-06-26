# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development

```bash
pnpm install                         # Install all deps
pnpm build                           # Build both packages (core → react)
pnpm build:core                      # Build only @acp-components/core
pnpm build:react                     # Build only @acp-components/react
pnpm lint                            # Lint all TypeScript in packages/*/src
```

### Web Demo

```bash
pnpm dev:server                      # Terminal 1 — WebSocket ↔ stdio bridge
pnpm dev                             # Terminal 2 — Vite dev server at localhost:5173
pnpm dev:tauri                       # Tauri desktop dev (stdio transport)
pnpm build:tauri                     # Tauri production build
```

### Running a single test

```bash
pnpm --filter @acp-components/core test -- -t "test name pattern"
pnpm --filter @acp-components/react test -- -t "test name pattern"
```

### Bridge server env vars

| Variable | Default | Description |
|----------|---------|-------------|
| `ACP_PORT` | `3100` | WebSocket port |
| `ACP_HOST` | `127.0.0.1` | WebSocket host |
| `ACP_AGENT` | `opencode` | Agent binary |
| `ACP_AGENT_ARGS` | `acp` | Agent arguments |

## Architecture

### Package Layering

```
Application Layer (Vite Demo / Tauri / Custom Apps)
  └─ @acp-components/react (UI Layer)
       Components (15+) + Hooks (useSyncExternalStore) + AcpContext + PlatformContext + Theme + i18n
       depends on ↓
     @acp-components/core (Data Layer)
       createAcpProvider (multi-agent lifecycle) + AcpClient (per-agent, wraps ACP SDK)
       + Transport (Stdio/WebSocket/HTTP/Custom) + acpStore + sessionStore + fileTreeStore (vanilla Zustand)
       + Actions (sessions/prompt/permission/fileTree/extensions, agent-aware)
       built on ↓
     @agentclientprotocol/sdk (ACP protocol types + ClientSideConnection)

Platform Layer (orthogonal to the above): a `Platform` interface (defined in `@acp-components/react`) + `PlatformContext`/`usePlatform()` provide host-native capabilities (file tree, file read/write, directory dialogs, persistence, updater) to the UI. Each host (web demo, Tauri template) implements its own `Platform` (`createWebPlatform` / `createTauriPlatform`). core does NOT implement `Platform` — it only owns the shared primitive types (`PlatformKind`, `AsyncStorage`, `UpdaterState`, …).
```

**Critical rules**:
- `@acp-components/core` has zero React dependency. It uses vanilla Zustand stores. React layer subscribes via `useSyncExternalStore`. Never add React imports to core.
- `AcpClient`'s client-side callbacks are **only** `sessionUpdate` / `requestPermission` / `extMethod` / `extNotification`. Core does **not** implement ACP `readTextFile` / `writeTextFile` / `createTerminal` reverse calls — file/terminal capabilities were removed from core. File access is a UI-side capability consumed via `usePlatform()`; the terminal is not provided by the base at all.
- `Platform` and `AcpContext` are orthogonal: `Platform`/`usePlatform()` for native capabilities, `AcpContext`/`useAcpContext()` for agent connection/session state. Agent transport is configured via `AgentConfig.transport` on `AcpProvider` and is **not** part of `Platform`.

### Multi-Agent & Multi-Workspace State Model

```
acpStore (global):
  agents: Map<agentId, AgentConnection>        — per-agent status, info, capabilities, authMethods
  workspaces: Map<cwd, WorkspaceState>          — per-workspace sessions
  activeSessionId: SessionId | null             — global active session (workspace derived via SessionMeta.cwd)
  pendingAuth: { agentId } | null               — pending auth agent

sessionStore (per-session, keyed by SessionId):
  messages[], isStreaming, pendingToolCalls (Map),
  pendingPermissions[], plan[], usage, configOptions[], availableCommands[]

fileTreeStore (per-workspace):
  per-cwd file-tree state (nodes / expanded / loaded / error); directory reader is injected from Platform.readDirectory
```

- **Agent** = independent ACP connection (transport + status + capabilities). Connected in parallel.
- **Workspace** = directory (cwd). Holds sessions from multiple agents.
- **Session** = belongs to workspace + agent pair (`SessionMeta.agentId` + `SessionMeta.cwd`).
- **Active Workspace** = derived from `activeSessionId` by looking up `SessionMeta.cwd` in workspaces.

### Data Flow (Unidirectional)

```
Agent → NDJSON stream → Transport.readable
  → AcpClient.onSessionUpdate (per agent)
    → createAcpProvider dispatches sessionUpdate type to store actions
      → acpStore / sessionStore (Zustand vanilla)
        → useSyncExternalStore → React Hooks → Components re-render
          → user action → Actions → AcpClient.prompt/cancel → Transport.writable → Agent
```

Native capabilities (file tree, file read/write, directory picker, persistence) flow on a **separate, orthogonal path**: `UI → usePlatform() → host Platform → native/host API`. They do not pass through `AcpProvider`. The per-workspace file tree is driven automatically by `<PlatformFileTreeAuto>` (mounted inside `<PlatformProvider>`), which registers `platform.readDirectory` as the reader for `fileTreeStore`.

SessionUpdate dispatch mapping (in `provider.ts:setupSessionUpdateHandler`):
- `agent_message_chunk` / `user_message_chunk` → `store.appendContent()`
- `agent_thought_chunk` → `store.appendThought()`
- `tool_call` → `store.upsertToolCall()` / `tool_call_update` → `store.updateToolCall()`
- `plan` → `store.setPlan()`
- `usage_update` → `store.setUsage()`
- `config_option_update` → `store.setConfigOptions()`
- `available_commands_update` → `store.setAvailableCommands()`
- `session_info_update` → `acpStore.updateSession()`

### Key Files

| File | Role |
|------|------|
| `packages/core/src/provider.ts` | `createAcpProvider()` — multi-agent lifecycle orchestrator, session update dispatch, auto-refresh on workspace switch |
| `packages/core/src/client/AcpClient.ts` | Per-agent wrapper around `ClientSideConnection`. Owns transport lifecycle, client-side callbacks (sessionUpdate/permission/extMethod/extNotification — **no** file/terminal), and ACP method calls |
| `packages/core/src/store/acpStore.ts` | Global Zustand store: agents, workspaces (sessions per workspace), activeSessionId, pendingAuth |
| `packages/core/src/store/sessionStore.ts` | Per-session Zustand store: messages, streaming, tool calls, plan, usage, config, commands (no terminal) |
| `packages/core/src/store/fileTreeStore.ts` | Per-workspace Zustand store: file-tree state; reader injected from `Platform.readDirectory` |
| `packages/core/src/actions/` | `sessions.ts`, `prompt.ts`, `permission.ts`, `fileTree.ts`, `extensions.ts` — imperative actions that route to the correct AcpClient via `clientRegistry` |
| `packages/core/src/types/index.ts` | All shared types: `AgentConfig`, `TransportConfig`, `WorkspaceState`, `AgentConnection`, `PermissionRequest`, plus Platform primitives (`PlatformKind`, `AsyncStorage`, `UpdaterState`, …) |
| `packages/core/src/transport/` | `StdioTransport`, `HttpTransport`, `WebSocketTransport` + `AcpTransport` interface for custom transports |
| `packages/react/src/context/AcpContext.ts` | React context providing `getClient(agentId)`, agents list, workspaces, workspace actions (agent data layer only) |
| `packages/react/src/context/PlatformContext.tsx` | `Platform` interface + `PlatformContext` + `usePlatform()` — environment-agnostic native-capability contract (orthogonal to `AcpContext`) |
| `packages/react/src/components/platform/` | `PlatformProvider` (injects Platform + auto-mounts file-tree driver) and `PlatformFileTreeAuto` (drives `fileTreeStore` from `platform.readDirectory`/`watchFileTree`) |
| `packages/react/src/hooks/` | All hooks wrapping `useSyncExternalStore` for acpStore/sessionStore/fileTreeStore subscriptions |
| `packages/react/src/components/` | 15+ components, each in its own subdirectory (no `TerminalView` — terminal not provided by base) |

### Permission Flow

```
Agent → requestPermission → AcpClient.permissionHandler (Promise-wrapped)
  → sessionStore.addPermissionRequest()
    → PermissionDialog displays
      → Allow → respondToPermission(id, optionId) → resolve(optionId)
      → Deny  → denyPermission(id) → reject()
```

### Transport Extension Point

Implement `AcpTransport` interface (`connect/disconnect/onClose/onError`) and pass as `{ type: 'custom', transport: instance }` in `AgentConfig`. Real examples: Tauri IPC, Electron IPC, iframe postMessage.

### Platform Extension Point

Implement the `Platform` interface (defined in `packages/react/src/context/PlatformContext.tsx`) and inject it via `<PlatformProvider platform={instance}>` at the app root (above `I18nProvider` and `AcpProvider`). Reference factories: `createWebPlatform()` (`examples/demo/src/webPlatform.ts`) and `createTauriPlatform()` (`examples/tauri/src/tauriPlatform.ts`). By default `PlatformProvider` mounts `<PlatformFileTreeAuto>`, which drives `fileTreeStore` from `platform.readDirectory` / `watchFileTree` — set `autoFileTree={false}` to wire your own file-tree setup.

## Style Rules

- Use CSS custom properties (`--acp-*` design tokens) — **never** hardcode hex color values.
- Avoid inline `style="..."` unless the value is dynamically computed.
- CSS Modules with `camelCaseOnly` locals convention.
- Theme via `data-acp-theme` attribute on container element. Built-in: `"dark"` (default), `"light"`.
- Declaration order: positioning → box model → flex/grid → typography → visuals.

## Key Conventions

- Monorepo with pnpm workspaces (no npm/yarn). `packages/*` and `examples/*` are workspace packages.
- TypeScript strict mode. ES2022 target, ESNext modules, bundler module resolution.
- Each package builds with Vite library mode (dual ESM/CJS output) + `tsc --emitDeclarationOnly` for types.
- SCSS Modules for React component styles. Global theme variables in `react/src/styles/`.
- i18n via i18next with auto-detection (localStorage → navigator.language → default). Built-in en-US and zh-CN locales in `packages/react/src/i18n/locales/`.
