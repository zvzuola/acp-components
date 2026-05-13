import React from 'react';
import { useSession } from '../../hooks/useSession';
import { useAcpContext } from '../../context/AcpContext';
import { setSessionConfigOption } from '@acp-components/core';
import type { SessionId, SessionConfigOption, SessionConfigSelectOptions, SessionConfigSelectOption, SessionConfigSelectGroup } from '@agentclientprotocol/sdk';
import styles from './session-config-panel.module.scss';

export interface SessionConfigPanelProps {
  sessionId: SessionId | null;
}

function isGrouped(options: SessionConfigSelectOptions): options is SessionConfigSelectGroup[] {
  return options.length > 0 && 'options' in options[0];
}

function SelectOption({ option }: { option: SessionConfigSelectOption }) {
  return <option value={option.value}>{option.name}</option>;
}

export function SessionConfigPanel({ sessionId }: SessionConfigPanelProps) {
  const { configOptions } = useSession(sessionId);
  const { client } = useAcpContext();

  if (!sessionId || configOptions.length === 0) return null;

  const handleChange = async (configId: string, value: string | boolean) => {
    await setSessionConfigOption(client, sessionId!, configId, value);
  };

  return (
    <div className={styles.acpSessionConfigPanel}>
      {configOptions.map((opt: SessionConfigOption) => (
        <div key={opt.id} className={styles.acpSessionConfigItem}>
          <label className={styles.acpSessionConfigLabel} htmlFor={`config-${opt.id}`}>
            {opt.name}
          </label>
          {opt.type === 'boolean' ? (
            <div className={styles.acpSessionConfigToggle}>
              <button
                id={`config-${opt.id}`}
                role="switch"
                aria-checked={opt.currentValue}
                className={`${styles.acpSessionConfigSwitch} ${opt.currentValue ? styles.acpSessionConfigSwitchOn : ''}`}
                onClick={() => handleChange(opt.id, !opt.currentValue)}
              >
                <span className={styles.acpSessionConfigSwitchKnob} />
              </button>
            </div>
          ) : (
            <select
              id={`config-${opt.id}`}
              className={styles.acpSessionConfigSelect}
              value={opt.currentValue}
              onChange={(e) => handleChange(opt.id, e.target.value)}
            >
              {isGrouped(opt.options) ? (
                opt.options.map((group: SessionConfigSelectGroup) => (
                  <optgroup key={group.group} label={group.name}>
                    {group.options.map((o) => (
                      <SelectOption key={o.value} option={o} />
                    ))}
                  </optgroup>
                ))
              ) : (
                opt.options.map((o) => (
                  <SelectOption key={(o as SessionConfigSelectOption).value} option={o as SessionConfigSelectOption} />
                ))
              )}
            </select>
          )}
          {opt.description && (
            <span className={styles.acpSessionConfigDescription}>{opt.description}</span>
          )}
        </div>
      ))}
    </div>
  );
}
