import type { Implementation } from '@acp-components/core';

/**
 * Display name for an agent — prefer the human-readable `agentInfo.title`
 * the agent advertises, fall back to its programmatic `agentInfo.name`, then
 * to the locally-configured `AgentConfig.name`. `title` is nullable in the
 * ACP schema, so empty/null/whitespace are skipped.
 *
 * `agent` is accepted as a loose structural shape (`{ agentInfo, name }`)
 * so callers can pass an `AgentConnection`, a `Pick` of one, or
 * `undefined` (yields `''`) without importing the full type.
 */
export function getAgentName(agent?: { agentInfo: Implementation | null; name: string } | null): string {
  const info = agent?.agentInfo;
  if (info?.title && info.title.trim()) return info.title;
  if (info?.name && info.name.trim()) return info.name;
  return agent?.name ?? '';
}
