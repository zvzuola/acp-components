// ---------------------------------------------------------------------------
// Stdio transport — host-injected, not built into core.
//
// core intentionally does NOT own a stdio spawn implementation: spawning a child
// process is a host-native capability (Node `child_process`, Tauri Rust backend,
// Electron main, …) that a browser host simply cannot back. A host provides its
// concrete stdio transport via `Platform.process.createStdioTransport` (see the
// react-layer `Platform` interface); the React `AcpProvider` resolves that
// factory and injects it into `createAcpProvider` → `AcpClient`, which
// `createTransport` consults for `{ type: 'stdio' }` configs.
//
// When no factory is injected, a `stdio` transport config fails fast at
// connect time rather than failing later inside a baked-in spawn. This keeps
// the data-vs-capability split consistent with `fs` / `readFileContent`.
// ---------------------------------------------------------------------------

/**
 * Spawn parameters for a host-provided stdio transport. Mirrors the plain-data
 * `stdio` branch of `TransportConfig` (command / args / env) so a host factory
 * can be driven directly from a persisted agent config without translation.
 */
export interface StdioTransportOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}
