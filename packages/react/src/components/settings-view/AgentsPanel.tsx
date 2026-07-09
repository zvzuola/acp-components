import React, { useCallback, useMemo, useState } from 'react';
import { DeleteOutlined, PlusOutlined, RobotOutlined } from '@ant-design/icons';
import type { AgentConfig, AgentConnection, TransportConfig } from '@acp-components/core';
import { useI18n } from '../../i18n';
import { usePlatform } from '../../context/PlatformContext';
import { useAcpContext } from '../../context/AcpContext';
import { getAgentName } from '../../utils/agentName';
import { Select } from '../select';
import type { SelectOption } from '../select';
import styles from './agents-panel.module.scss';

// ---------------------------------------------------------------------------
// AgentsPanel — list + add/remove of configured agents.
//
// Reads the live agent list from `useAcpContext()` (which mirrors
// `acpStore.agents`) and mutates it through `addAgent` / `removeAgent`. Each
// agent renders as a row with a connection-status dot, the transport target,
// and a trailing delete button. The add form composes an `AgentConfig` from
// name + transport type + target (URL or command), generating a unique id
// from the name so the user never has to think about ids. Add errors surface
// inline under the form (e.g. a transport that fails to connect).
// ---------------------------------------------------------------------------

/** Status dot variant per connection state — mirrors ConnectionStatus colors. */
const agentStatusDotClass: Record<AgentConnection['status'], string> = {
  connected: styles.acpSettingsViewAgentDotConnected,
  connecting: styles.acpSettingsViewAgentDotConnecting,
  disconnected: styles.acpSettingsViewAgentDotDisconnected,
  error: styles.acpSettingsViewAgentDotError,
};

/** Transport types offered in the add form. `custom` is excluded — it needs a
 * pre-built transport instance the form can't synthesize from text fields. */
type AddableTransportType = 'websocket' | 'http' | 'stdio';

/** Full set of addable transport options. `stdio` requires a host-provided
 * spawn capability (`Platform.process.createStdioTransport`); when the host
 * omits it, `stdio` is filtered out of the picker (see `transportOptions` in
 * `AgentsPanel`) — offering it would let the user build a config that can
 * never connect. */
const ALL_TRANSPORT_OPTIONS: SelectOption[] = [
  { value: 'websocket', label: 'WebSocket' },
  { value: 'http', label: 'HTTP' },
  { value: 'stdio', label: 'Stdio' },
];

/**
 * Short label for an existing agent row. The live `AgentConnection` in the
 * store does NOT retain the original `AgentConfig.transport` (only connection
 * state + advertised agent info), so we can't echo back the configured URL or
 * command — fall back to the agent's programmatic name, then its id.
 */
function transportSummary(agent: AgentConnection): string {
  return agent.agentInfo?.name ?? agent.id;
}

/**
 * Derive a stable, unique agent id from a display name. Lowercases, collapses
 * runs of non-alphanumeric into a single dash, and appends a numeric suffix
 * when the id already collides with an existing agent id. Lets users add by
 * name only — they never have to think about ids.
 */
function deriveAgentId(name: string, existingIds: Set<string>): string {
  const base = (name || 'agent')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'agent';
  if (!existingIds.has(base)) return base;
  let n = 2;
  while (existingIds.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export function AgentsPanel() {
  const { t } = useI18n();
  const { agents, addAgent, removeAgent, builtinAgentIds } = useAcpContext();
  const { process: processSlice } = usePlatform();

  // stdio is only usable when the host provides a spawn capability
  // (`Platform.process.createStdioTransport`). A web host that can't spawn a
  // child process omits the slice → drop `stdio` from the picker so users
  // can't build a config that can never connect. Desktop hosts that provide
  // the factory keep the full set. This is the same capability check the
  // provider uses when injecting the factory, so the picker can never offer a
  // transport the connection layer would reject.
  const canStdio = !!processSlice?.createStdioTransport;
  const transportOptions = useMemo(
    () => canStdio
      ? ALL_TRANSPORT_OPTIONS
      : ALL_TRANSPORT_OPTIONS.filter((o) => o.value !== 'stdio'),
    [canStdio],
  );

  // Add-form state
  const [name, setName] = useState('');
  const [transportType, setTransportType] = useState<AddableTransportType>('websocket');
  const [url, setUrl] = useState('');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isUrlTransport = transportType === 'websocket' || transportType === 'http';
  const targetValue = isUrlTransport ? url : command;
  const canAdd = name.trim().length > 0 && targetValue.trim().length > 0 && !adding;

  const resetForm = useCallback(() => {
    setName('');
    setUrl('');
    setCommand('');
    setArgs('');
    setError(null);
  }, []);

  const handleAdd = useCallback(async () => {
    if (!canAdd) return;
    setAdding(true);
    setError(null);
    try {
      // `agents` from AcpContext is always an array (AgentConnection[]); build
      // a Set of existing ids so the derived id stays unique.
      const existingIds = new Set(agents.map((a) => a.id));
      const id = deriveAgentId(name, existingIds);
      const transport: TransportConfig = isUrlTransport
        ? { type: transportType, url: url.trim() }
        : { type: 'stdio', command: command.trim(), args: args.trim() ? args.trim().split(/\s+/) : undefined };
      const config: AgentConfig = { id, name: name.trim(), transport };
      await addAgent(config);
      resetForm();
    } catch (err) {
      console.error('Failed to add agent:', err);
      setError(t('agentsView.addError'));
    } finally {
      setAdding(false);
    }
  }, [canAdd, name, agents, isUrlTransport, transportType, url, command, args, addAgent, resetForm, t]);

  const handleRemove = useCallback((agentId: string) => {
    void removeAgent(agentId);
  }, [removeAgent]);

  const handleTransportTypeChange = useCallback((value: string) => {
    setTransportType(value as AddableTransportType);
    setError(null);
  }, []);

  return (
    <div className={styles.acpSettingsViewItems} role="list" aria-label={t('agentsView.title')}>
      {agents.length === 0 ? (
        <div className={styles.acpSettingsViewAgentsEmpty}>{t('agentsView.empty')}</div>
      ) : (
        agents.map((agent) => {
          // Built-in agents (from the `agents` prop) are not user-managed — no
          // delete affordance. `removeAgent` would reject them anyway, but
          // hiding the button is the honest UX: the guard is the source of
          // truth, the UI reflects it.
          const removable = !builtinAgentIds.has(agent.id);
          return (
            <div key={agent.id} className={styles.acpSettingsViewAgentRow} role="listitem">
              <span className={styles.acpSettingsViewAgentIcon} aria-hidden="true">
                <RobotOutlined />
              </span>
              <span className={styles.acpSettingsViewAgentName}>{getAgentName(agent) || agent.id}</span>
              {!removable && (
                <span className={styles.acpSettingsViewAgentBuiltin}>{t('agentsView.builtin')}</span>
              )}
              <span
                className={`${styles.acpSettingsViewAgentDot} ${agentStatusDotClass[agent.status] ?? ''}`}
                aria-hidden="true"
              />
              <span className={styles.acpSettingsViewAgentStatus}>
                {t(`agentsView.status${agent.status[0].toUpperCase()}${agent.status.slice(1)}`)}
              </span>
              <span className={styles.acpSettingsViewAgentTransport} title={transportSummary(agent)}>
                {transportSummary(agent)}
              </span>
              {removable && (
                <button
                  type="button"
                  className={styles.acpSettingsViewAgentRemove}
                  onClick={() => handleRemove(agent.id)}
                  aria-label={t('agentsView.removeAriaLabel')}
                  title={t('agentsView.remove')}
                >
                  <DeleteOutlined />
                </button>
              )}
            </div>
          );
        })
      )}

      {/* Add form */}
      <div className={styles.acpSettingsViewAddForm}>
        <div className={styles.acpSettingsViewAddRow}>
          <label className={styles.acpSettingsViewField}>
            <span className={styles.acpSettingsViewFieldLabel}>{t('agentsView.name')}</span>
            <input
              type="text"
              className={styles.acpSettingsViewInput}
              value={name}
              onChange={(e) => { setName(e.target.value); setError(null); }}
              placeholder={t('agentsView.namePlaceholder')}
              aria-label={t('agentsView.name')}
            />
          </label>

          <label className={styles.acpSettingsViewField}>
            <span className={styles.acpSettingsViewFieldLabel}>{t('agentsView.transport')}</span>
            <Select
              className={styles.acpSettingsViewTransportSelect}
              aria-label={t('agentsView.transport')}
              value={transportType}
              onChange={handleTransportTypeChange}
              options={transportOptions}
            />
          </label>
        </div>

        <div className={styles.acpSettingsViewAddRow}>
          {isUrlTransport ? (
            <label className={styles.acpSettingsViewField}>
              <span className={styles.acpSettingsViewFieldLabel}>{t('agentsView.transportUrl')}</span>
              <input
                type="text"
                className={styles.acpSettingsViewInput}
                value={url}
                onChange={(e) => { setUrl(e.target.value); setError(null); }}
                placeholder={t('agentsView.transportUrlPlaceholder')}
                aria-label={t('agentsView.transportUrl')}
              />
            </label>
          ) : (
            <>
              <label className={styles.acpSettingsViewField}>
                <span className={styles.acpSettingsViewFieldLabel}>{t('agentsView.transportCommand')}</span>
                <input
                  type="text"
                  className={styles.acpSettingsViewInput}
                  value={command}
                  onChange={(e) => { setCommand(e.target.value); setError(null); }}
                  placeholder={t('agentsView.transportCommandPlaceholder')}
                  aria-label={t('agentsView.transportCommand')}
                />
              </label>
              <label className={styles.acpSettingsViewField}>
                <span className={styles.acpSettingsViewFieldLabel}>{t('agentsView.args')}</span>
                <input
                  type="text"
                  className={styles.acpSettingsViewInput}
                  value={args}
                  onChange={(e) => { setArgs(e.target.value); setError(null); }}
                  placeholder={t('agentsView.argsPlaceholder')}
                  aria-label={t('agentsView.args')}
                />
              </label>
            </>
          )}
        </div>

        {error && (
          <div className={styles.acpSettingsViewAddError} role="alert">{error}</div>
        )}

        <button
          type="button"
          className={styles.acpSettingsViewAddBtn}
          onClick={handleAdd}
          disabled={!canAdd}
        >
          <PlusOutlined />
          <span>{adding ? t('agentsView.adding') : t('agentsView.add')}</span>
        </button>
      </div>
    </div>
  );
}
