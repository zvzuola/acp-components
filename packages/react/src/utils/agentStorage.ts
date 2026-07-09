import type { AgentConfig, PlatformStorage } from '@acp-components/core';

/**
 * Persistence for the agent **configuration** list (not runtime connection
 * state). Mirrors the workspace load/save helpers in
 * `PlatformWorkspacesAuto`: host-agnostic by construction (only touches the
 * `storage` slice), and a corrupt / non-array payload yields `[]` so a bad
 * cache never crashes the app — a fresh start is always preferable.
 *
 * What is persisted: the user-managed `AgentConfig` set — `id`, `name`,
 * `transport`, plus optional `clientInfo` / `clientCapabilities`. On launch
 * `AcpProvider` replays each cached config through `provider.addAgent()` so
 * the agent reconnects; the live `AgentConnection` (status, advertised info,
 * capabilities) is re-derived from the fresh connection, never stored.
 *
 * What is NOT persisted: agents whose transport is `{ type: 'custom' }`. A
 * custom transport carries a host-built instance (functions / handles) that
 * cannot round-trip through JSON, so it is skipped at save time (with a
 * console warning) rather than silently dropping on load. The built-in
 * transport kinds — `stdio` / `http` / `websocket` — are plain data and
 * persist fine.
 */

const STORAGE_KEY = 'agents';

/**
 * Whether an `AgentConfig` is round-trippable through JSON storage. Custom
 * transports carry a live instance and are skipped — they can only be
 * (re)provided by the host via the `AcpProvider` `agents` prop, never restored
 * from a cache.
 */
function isPersistable(config: AgentConfig): boolean {
  return config.transport.type !== 'custom';
}

/**
 * Load the persisted agent configuration list. Returns `[]` when storage is
 * empty, the payload is not a JSON array, or any entry fails a minimal shape
 * check — a corrupt cache is treated as a fresh start rather than crashing.
 */
export async function loadAgents(storage: PlatformStorage): Promise<AgentConfig[]> {
  const raw = await storage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const configs: AgentConfig[] = [];
    for (const entry of parsed) {
      // Minimal structural validation — skip malformed entries rather than
      // aborting the whole cache (one bad entry shouldn't lose the rest).
      if (
        entry &&
        typeof entry === 'object' &&
        typeof entry.id === 'string' &&
        typeof entry.name === 'string' &&
        entry.transport &&
        typeof entry.transport === 'object' &&
        typeof entry.transport.type === 'string'
      ) {
        configs.push(entry as AgentConfig);
      }
    }
    return configs;
  } catch {
    // Corrupt cache — treat as empty so the app starts cleanly.
    return [];
  }
}

/**
 * Persist the agent configuration list. Custom-transport configs are skipped
 * (they cannot round-trip) and logged so the omission is visible — the host is
 * expected to keep providing such agents via the `AcpProvider` `agents` prop.
 */
export async function saveAgents(
  storage: PlatformStorage,
  configs: AgentConfig[],
): Promise<void> {
  const persistable = configs.filter((c) => {
    if (!isPersistable(c)) {
      console.warn(
        `[agents] Skipping persistence of agent "${c.id}": custom transport cannot be serialized. ` +
          `Provide it via the AcpProvider \`agents\` prop instead.`,
      );
      return false;
    }
    return true;
  });
  await storage.setItem(STORAGE_KEY, JSON.stringify(persistable));
}
