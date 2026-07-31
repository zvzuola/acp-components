import { useCallback, useEffect, useMemo, useState } from 'react';
import { RobotOutlined } from '@ant-design/icons';
import { sendPrompt, setSessionConfigOption } from '@acp-components/core';
import type { ContentBlock, PromptCapabilities, SessionId, SessionConfigOption, SessionConfigSelectOptions, SessionConfigSelectGroup } from '@acp-components/core';
import { useAcpContext } from '../../context/AcpContext';
import { usePlatform } from '../../context/PlatformContext';
import { useAcpStore } from '../../hooks/useAcpStore';
import { useSessions } from '../../hooks/useSessions';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import { useI18n } from '../../i18n';
import { Select } from '../select';
import type { SelectOption, SelectOptionGroup } from '../select';
import { ChatComposer } from '../chat-view';
import { getAgentName } from '../../utils/agentName';
import styles from './new-session-view.module.scss';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NewSessionViewProps {
  /** Extra class on the root */
  className?: string;
  /** Called after a session is created and the first prompt is sent. */
  onSubmitted?: (sessionId: SessionId) => void;
  /** Opens the host's agent-management surface from the empty state. */
  onAddAgent?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getWorkspaceName(cwd: string): string {
  const normalized = cwd.replace(/[/\\]+$/, '');
  const parts = normalized.split(/[/\\]/);
  return parts[parts.length - 1] || cwd;
}

/** Sentinel option value that opens the native folder picker instead of selecting. */
const PICK_FOLDER_VALUE = '__acp_pick_folder__';

/** Stable empty default so the cached-configOptions selector doesn't churn. */
const EMPTY_CONFIG_OPTIONS: SessionConfigOption[] = [];

function isGroupedOptions(options: SessionConfigSelectOptions): options is SessionConfigSelectGroup[] {
  return options.length > 0 && 'options' in options[0];
}

/** Map ACP config select options → the shared <Select> options shape. */
function mapConfigOptions(options: SessionConfigSelectOptions): (SelectOption | SelectOptionGroup)[] {
  if (isGroupedOptions(options)) {
    return options.map((group) => ({
      label: group.name,
      options: group.options.map((o) => ({ value: o.value, label: o.name })),
    }));
  }
  return options.map((o) => ({ value: o.value, label: o.name }));
}

/**
 * Find the first select-type config option whose `category` matches. ACP lets
 * agents expose model / mode / thought-level selectors as configOptions with a
 * semantic category; we drive the NewSessionView selectors off those.
 */
function findSelectByCategory(
  options: SessionConfigOption[],
  category: string,
): Extract<SessionConfigOption, { type: 'select' }> | undefined {
  return options.find(
    (o): o is Extract<SessionConfigOption, { type: 'select' }> =>
      o.type === 'select' && o.category === category,
  );
}

// ---------------------------------------------------------------------------
// NewSessionView — Codex-style landing: centered hero + primary composer
// ---------------------------------------------------------------------------

export function NewSessionView({ className, onSubmitted, onAddAgent }: NewSessionViewProps) {
  const { t } = useI18n();
  const { getClient } = useAcpContext();
  const { dialogs } = usePlatform();
  const openFilePicker = dialogs?.openFilePicker;
  const agents = useAcpStore((s) => s.agents);
  const { workspaces, activeWorkspaceCwd, addWorkspace } = useWorkspaces();
  const { createSession, setActiveSession } = useSessions();

  const agentList = useMemo(() => Array.from(agents.values()), [agents]);
  const workspaceList = workspaces;

  // Defaults: active workspace (or first), first connected agent (or first).
  const defaultCwd = useMemo(() => {
    if (activeWorkspaceCwd) return activeWorkspaceCwd;
    return workspaceList[0]?.cwd ?? null;
  }, [activeWorkspaceCwd, workspaceList]);

  const defaultAgentId = useMemo(() => {
    const connected = agentList.find((a) => a.status === 'connected');
    return (connected ?? agentList[0])?.id ?? null;
  }, [agentList]);

  const [cwd, setCwd] = useState<string | null>(defaultCwd);
  const [agentId, setAgentId] = useState<string | null>(defaultAgentId);
  const [composerValue, setComposerValue] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Keep defaults in sync if the host hasn't connected agents / added
  // workspaces yet on first render.
  useEffect(() => {
    if (cwd === null && defaultCwd) setCwd(defaultCwd);
  }, [cwd, defaultCwd]);
  useEffect(() => {
    if (agentId === null && defaultAgentId) setAgentId(defaultAgentId);
  }, [agentId, defaultAgentId]);

  // Prompt capabilities of the currently-selected agent — drives the
  // attachment content-block shape (image / resource / link).
  const promptCapabilities = useAcpStore((s) => {
    if (!agentId) return undefined;
    return s.agents.get(agentId)?.capabilities?.promptCapabilities;
  }) as PromptCapabilities | undefined;

  // Agent-level cache of the most recently observed configOptions. ACP only
  // surfaces model/mode options after a session exists (NewSessionResponse),
  // so before the first session this is empty and the selectors stay hidden.
  const cachedConfigOptions = useAcpStore((s) =>
    agentId ? s.agents.get(agentId)?.configOptions : undefined,
  ) ?? EMPTY_CONFIG_OPTIONS;

  const modelOption = useMemo(
    () => findSelectByCategory(cachedConfigOptions, 'model'),
    [cachedConfigOptions],
  );
  const modeOption = useMemo(
    () => findSelectByCategory(cachedConfigOptions, 'mode'),
    [cachedConfigOptions],
  );

  const [modelValue, setModelValue] = useState<string | null>(null);
  const [modeValue, setModeValue] = useState<string | null>(null);

  // Reset model/mode selection when the agent changes — each agent has its
  // own option set, so a stale value from another agent is meaningless.
  useEffect(() => {
    setModelValue(null);
    setModeValue(null);
  }, [agentId]);

  const hasAgent = agentList.length > 0;

  // Workspace change: the dropdown also carries a "pick a folder…" entry that
  // opens the native directory picker instead of selecting an existing one.
  // The picker may be absent on a minimal host — fall back to the first option.
  const pickFolder = useCallback(async () => {
    if (!openFilePicker) return;
    try {
      const dir = await openFilePicker({ directory: true });
      if (!dir) return;
      addWorkspace(dir);
      setCwd(dir);
    } catch (err) {
      console.error('Failed to pick folder:', err);
    }
  }, [openFilePicker, addWorkspace]);

  const handleWorkspaceChange = useCallback(
    (value: string) => {
      if (value === PICK_FOLDER_VALUE) {
        void pickFolder();
        return;
      }
      setCwd(value);
    },
    [pickFolder],
  );

  // External send: create the session on submit, then send the first prompt
  // through the core action (the freshly created id isn't bound to a
  // usePrompt hook instance yet, so resolve the client the same way
  // useSessions/usePrompt do internally).
  const handleSend = useCallback(
    async (blocks: ContentBlock[]) => {
      const activeCwd = cwd ?? defaultCwd ?? '';
      const activeAgentId = agentId ?? defaultAgentId;
      if (!activeAgentId) return;
      setComposerValue('');
      setSubmitting(true);
      try {
        const id = await createSession(activeAgentId, activeCwd);
        setActiveSession(id);
        const client = getClient(activeAgentId);
        if (client) {
          // Apply the user's model/mode selection before the first prompt.
          // Both ride the configOption channel (category=model/mode select);
          // failures are non-fatal — the turn still sends with the defaults.
          try {
            if (modelOption && modelValue && modelValue !== modelOption.currentValue) {
              await setSessionConfigOption(client, id, modelOption.id, modelValue);
            }
            if (modeOption && modeValue && modeValue !== modeOption.currentValue) {
              await setSessionConfigOption(client, id, modeOption.id, modeValue);
            }
          } catch (cfgErr) {
            console.warn('Failed to apply model/mode selection:', cfgErr);
          }
          await sendPrompt(client, id, blocks);
        }
        onSubmitted?.(id);
      } catch (err) {
        console.error('Failed to start new session:', err);
      } finally {
        setSubmitting(false);
      }
    },
    [cwd, agentId, defaultCwd, defaultAgentId, createSession, setActiveSession, getClient, onSubmitted, modelOption, modelValue, modeOption, modeValue],
  );

  const rootCls = [styles.acpNewSessionView, className || '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rootCls} role="application" aria-label={t('newSession.ariaLabel')}>
      <div className={styles.acpNewSessionViewInner}>
        <div className={styles.acpNewSessionViewHero}>
          <h1 className={styles.acpNewSessionViewTitle}>{t('newSession.title')}</h1>
          <p className={styles.acpNewSessionViewSubtitle}>{t('newSession.subtitle')}</p>
        </div>

        {!hasAgent ? (
          <div className={styles.acpNewSessionViewEmpty}>
            <p>{t('newSession.noAgents')}</p>
            {onAddAgent && (
              <button
                type="button"
                className={styles.acpNewSessionViewAddAgent}
                onClick={onAddAgent}
              >
                <RobotOutlined aria-hidden="true" />
                <span>{t('newSession.addAgent')}</span>
              </button>
            )}
          </div>
        ) : (
          <ChatComposer
            value={composerValue}
            onChange={setComposerValue}
            onSend={handleSend}
            isStreaming={submitting}
            promptCapabilities={promptCapabilities}
            placeholder={t('newSession.placeholder')}
          />
        )}

        {hasAgent && (
          <div className={styles.acpNewSessionViewSelectors}>
            <Select
              className={styles.acpNewSessionViewSelect}
              borderless
              aria-label={t('newSession.selectWorkspace')}
              value={cwd ?? ''}
              placeholder={t('newSession.selectWorkspacePlaceholder')}
              onChange={handleWorkspaceChange}
              options={[
                ...workspaceList.map((ws) => ({
                  value: ws.cwd,
                  label: getWorkspaceName(ws.cwd),
                })),
                ...(openFilePicker
                  ? [{ value: PICK_FOLDER_VALUE, label: t('newSession.pickFolder') }]
                  : []),
              ]}
            />
            <Select
              className={styles.acpNewSessionViewSelect}
              borderless
              aria-label={t('newSession.selectAgent')}
              value={agentId ?? ''}
              onChange={setAgentId}
              options={agentList.map((a) => ({
                value: a.id,
                label: getAgentName(a),
              }))}
            />
            {modelOption && (
              <Select
                className={styles.acpNewSessionViewSelect}
                borderless
                aria-label={t('newSession.selectModel')}
                value={modelValue ?? modelOption.currentValue}
                onChange={setModelValue}
                options={mapConfigOptions(modelOption.options)}
              />
            )}
            {modeOption && (
              <Select
                className={styles.acpNewSessionViewSelect}
                borderless
                aria-label={t('newSession.selectMode')}
                value={modeValue ?? modeOption.currentValue}
                onChange={setModeValue}
                options={mapConfigOptions(modeOption.options)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
