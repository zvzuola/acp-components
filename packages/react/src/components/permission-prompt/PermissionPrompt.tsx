import { useEffect, useRef } from 'react';
import { usePermission } from '../../hooks/usePermission';
import type { SessionId } from '@acp-components/core';
import { useI18n } from '../../i18n';
import styles from './permission-prompt.module.scss';

export interface PermissionPromptProps {
  sessionId: SessionId | null;
}

export function PermissionPrompt({ sessionId }: PermissionPromptProps) {
  const { currentRequest, respond } = usePermission(sessionId);
  const cardRef = useRef<HTMLDivElement>(null);
  const { t } = useI18n();

  useEffect(() => {
    if (currentRequest && cardRef.current) {
      cardRef.current.focus();
    }
  }, [currentRequest]);

  if (!currentRequest || !sessionId) return null;

  const isAllowKind = (kind: string) => kind === 'allow_once' || kind === 'allow_always';
  const firstAllow = currentRequest.options.find(o => isAllowKind(o.kind));

  return (
    <div className={styles.acpPermissionPrompt} role="dialog" aria-label={t('permission.ariaLabel')}>
      <div className={styles.acpPermissionPromptCard} ref={cardRef} tabIndex={-1}>
        <h3 className={styles.acpPermissionPromptTitle}>{t('permission.title')}</h3>
        <p className={styles.acpPermissionPromptDesc}>
          {t('permission.description')}
        </p>
        <div className={styles.acpPermissionPromptTool}>
          <div className={styles.acpPermissionPromptToolName}>{currentRequest.toolCall.title}</div>
          {currentRequest.toolCall.rawInput != null && (
            <pre className={styles.acpPermissionPromptToolArgs}>
              {JSON.stringify(currentRequest.toolCall.rawInput, null, 2)}
            </pre>
          )}
        </div>
        <div className={styles.acpPermissionPromptActions}>
          {currentRequest.options.map((option) => (
            <button
              key={option.optionId}
              className={`${styles.acpPermissionPromptBtn} ${isAllowKind(option.kind) ? styles.acpPermissionPromptBtnAllow : styles.acpPermissionPromptBtnDeny}`}
              onClick={() => respond(sessionId, option.optionId)}
              autoFocus={option.optionId === firstAllow?.optionId}
            >
              {option.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
