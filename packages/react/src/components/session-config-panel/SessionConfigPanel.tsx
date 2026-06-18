import { useSessionConfigOptions } from '../../hooks/useSession';
import { useAcpContext } from '../../context/AcpContext';
import { useAcpStore } from '../../hooks/useAcpStore';
import { setSessionConfigOption, acpStore } from '@acp-components/core';
import type { SessionId, SessionConfigOption, SessionConfigSelectOptions, SessionConfigSelectGroup } from '@acp-components/core';
import { Select } from '../select';
import type { SelectOption, SelectOptionGroup } from '../select';
import styles from './session-config-panel.module.scss';

export interface SessionConfigPanelProps {
  sessionId: SessionId | null;
}

function isGrouped(options: SessionConfigSelectOptions): options is SessionConfigSelectGroup[] {
  return options.length > 0 && 'options' in options[0];
}

function mapOptions(options: SessionConfigSelectOptions): (SelectOption | SelectOptionGroup)[] {
  if (isGrouped(options)) {
    return options.map((group) => ({
      label: group.name,
      options: group.options.map((o) => ({ value: o.value, label: o.name })),
    }));
  }
  return options.map((o) => ({ value: o.value, label: o.name }));
}

export function SessionConfigPanel({ sessionId }: SessionConfigPanelProps) {
  const configOptions = useSessionConfigOptions(sessionId);
  const { getClient } = useAcpContext();

  if (!sessionId || configOptions.length === 0) return null;

  const state = acpStore.getState();
  let agentId: string | undefined;
  for (const [, ws] of state.workspaces) {
    const meta = ws.sessions.get(sessionId);
    if (meta) { agentId = meta.agentId; break; }
  }
  const client = agentId ? getClient(agentId) : null;

  const handleChange = async (configId: string, value: string | boolean) => {
    if (!client || !sessionId) return;
    await setSessionConfigOption(client, sessionId, configId, value);
  };

  return (
    <div className={styles.acpSessionConfigPanel}>
      {configOptions.map((opt: SessionConfigOption) => (
        <div key={opt.id} className={styles.acpSessionConfigItem}>
          {opt.type === 'boolean' ? (
            <div className={styles.acpSessionConfigToggle}>
              <button
                id={`config-${opt.id}`}
                role="switch"
                aria-checked={opt.currentValue}
                aria-label={opt.name}
                className={`${styles.acpSessionConfigSwitch} ${opt.currentValue ? styles.acpSessionConfigSwitchOn : ''}`}
                onClick={() => handleChange(opt.id, !opt.currentValue)}
              >
                <span className={styles.acpSessionConfigSwitchKnob} />
              </button>
            </div>
          ) : (
            <Select
              id={`config-${opt.id}`}
              options={mapOptions(opt.options)}
              value={opt.currentValue as string}
              onChange={(value) => handleChange(opt.id, value)}
              aria-label={opt.name}
              borderless
            />
          )}
          {opt.description && (
            <span className={styles.acpSessionConfigDescription}>{opt.description}</span>
          )}
        </div>
      ))}
    </div>
  );
}
