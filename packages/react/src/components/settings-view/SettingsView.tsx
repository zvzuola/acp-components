import React, { useCallback, useState } from 'react';
import {
  BgColorsOutlined,
  DeleteOutlined,
  GlobalOutlined,
  PlusOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import type { AgentConfig, AgentConnection, TransportConfig } from '@acp-components/core';
import { useI18n } from '../../i18n';
import { useSettings } from '../../context/SettingsContext';
import { usePlatform } from '../../context/PlatformContext';
import { useAcpContext } from '../../context/AcpContext';
import { getAgentName } from '../../utils/agentName';
import { Select } from '../select';
import type { SelectOption } from '../select';
import styles from './settings-view.module.scss';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SettingsViewProps {
  /** Active sub-section id (must match a `SETTINGS_SECTIONS` id). Defaults to appearance. */
  activeSection?: string;
  /** Extra class on the root */
  className?: string;
}

/**
 * Definition of a settings sub-section surfaced as a sidebar nav button while
 * the settings view is active. The registry lives here (with the view that
 * renders the panels) so adding a section is a one-file change: append a def
 * + a panel branch in `SettingsView`. `WorkbenchShell` consumes this list to
 * build the settings-mode sidebar nav.
 */
export interface SettingsSectionDef {
  /** Stable unique id */
  id: string;
  /** i18n key for the sidebar nav label */
  labelKey: string;
  /** Optional leading icon */
  icon?: React.ReactNode;
}

/** The built-in settings sections, in sidebar order. */
export const SETTINGS_SECTIONS: SettingsSectionDef[] = [
  { id: 'appearance', labelKey: 'settingsView.sectionAppearance', icon: <BgColorsOutlined /> },
  { id: 'agents', labelKey: 'settingsView.sectionAgents', icon: <RobotOutlined /> },
];

/** The active section when entering the settings view. */
export const SETTINGS_SECTION_APPEARANCE = 'appearance';

/** The Agents management section id. WorkbenchShell jumps here from the
 * sidebar's Agents nav item. */
export const SETTINGS_SECTION_AGENTS = 'agents';

// ---------------------------------------------------------------------------
// ToggleSwitch — small toggle pill for the theme row (SettingsView-specific)
// Mirrors the one in SettingsMenu so the two surfaces stay visually in sync.
// ---------------------------------------------------------------------------
function ToggleSwitch({ on }: { on: boolean }) {
  return (
    <span className={`${styles.acpSettingsViewToggle}${on ? ` ${styles.acpSettingsViewToggleOn}` : ''}`}>
      <span className={styles.acpSettingsViewToggleKnob} />
    </span>
  );
}

// ---------------------------------------------------------------------------
// AppearancePanel — theme + language. Today the only settings panel.
// ---------------------------------------------------------------------------
function AppearancePanel() {
  const { t, i18n } = useI18n();
  const { theme, setTheme } = useSettings();
  const { storage } = usePlatform();

  const currentLang = i18n.language?.startsWith('zh') ? 'zh-CN' : 'en-US';

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  const switchLanguage = useCallback((lang: string) => {
    i18n.changeLanguage(lang);
    storage('i18n').setItem('acp-i18n-locale', lang).catch(() => {});
  }, [i18n, storage]);

  return (
    <div className={styles.acpSettingsViewItems} role="list" aria-label={t('settingsView.sectionAppearance')}>
      {/* Theme */}
      <button
        type="button"
        className={styles.acpSettingsViewRow}
        onClick={toggleTheme}
        role="switch"
        aria-checked={theme === 'dark'}
      >
        <span className={styles.acpSettingsViewRowIcon} aria-hidden="true">
          <BgColorsOutlined />
        </span>
        <span className={styles.acpSettingsViewRowLabel}>{t('settingsView.theme')}</span>
        <span className={styles.acpSettingsViewRowValue}>
          {theme === 'dark' ? t('settingsView.themeDark') : t('settingsView.themeLight')}
        </span>
        <ToggleSwitch on={theme === 'dark'} />
      </button>

      {/* Language */}
      <div className={styles.acpSettingsViewRow}>
        <span className={styles.acpSettingsViewRowIcon} aria-hidden="true">
          <GlobalOutlined />
        </span>
        <span className={styles.acpSettingsViewRowLabel}>{t('settingsView.language')}</span>
        <div className={styles.acpSettingsViewLangOptions} role="group" aria-label={t('settingsView.language')}>
          <button
            type="button"
            className={`${styles.acpSettingsViewLangBtn}${currentLang === 'en-US' ? ` ${styles.acpSettingsViewLangBtnActive}` : ''}`}
            onClick={() => switchLanguage('en-US')}
            aria-pressed={currentLang === 'en-US'}
          >
            {t('settingsView.langEnglish')}
          </button>
          <button
            type="button"
            className={`${styles.acpSettingsViewLangBtn}${currentLang === 'zh-CN' ? ` ${styles.acpSettingsViewLangBtnActive}` : ''}`}
            onClick={() => switchLanguage('zh-CN')}
            aria-pressed={currentLang === 'zh-CN'}
          >
            {t('settingsView.langChinese')}
          </button>
        </div>
      </div>
    </div>
  );
}

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

const TRANSPORT_OPTIONS: SelectOption[] = [
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

function AgentsPanel() {
  const { t } = useI18n();
  const { agents, addAgent, removeAgent, builtinAgentIds } = useAcpContext();

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
              options={TRANSPORT_OPTIONS}
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

// ---------------------------------------------------------------------------
// SettingsView
//
// A full-page settings surface reachable from the settings dropdown's
// "Open settings" item. While active, the sidebar's top nav is replaced with
// a Back button + the section list (see SETTINGS_SECTIONS); `activeSection`
// selects which panel renders here. Add new sections by appending to
// SETTINGS_SECTIONS + a panel branch in `renderPanel`.
// ---------------------------------------------------------------------------
export function SettingsView({ activeSection = SETTINGS_SECTION_APPEARANCE, className }: SettingsViewProps) {
  const { t } = useI18n();

  const rootCls = [styles.acpSettingsView, className || ''].filter(Boolean).join(' ');

  // Resolve the active panel. Unknown/missing section falls back to appearance
  // so the view never renders an empty body. Add new sections by extending
  // this switch + SETTINGS_SECTIONS.
  const renderPanel = () => {
    switch (activeSection) {
      case SETTINGS_SECTION_AGENTS:
        return <AgentsPanel />;
      default:
        return <AppearancePanel />;
    }
  };

  return (
    <div className={rootCls} role="application" aria-label={t('settingsView.title')}>
      <div className={styles.acpSettingsViewHeader}>
        <span className={styles.acpSettingsViewTitle}>{t('settingsView.title')}</span>
      </div>
      {renderPanel()}
    </div>
  );
}
