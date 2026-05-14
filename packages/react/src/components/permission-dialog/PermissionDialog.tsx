import React, { useEffect, useRef } from 'react';
import { usePermission } from '../../hooks/usePermission';
import type { SessionId } from '@agentclientprotocol/sdk';
import { useI18n } from '../../i18n';
import styles from './permission-dialog.module.scss';

export interface PermissionDialogProps {
  sessionId: SessionId | null;
}

export function PermissionDialog({ sessionId }: PermissionDialogProps) {
  const { currentRequest, respond } = usePermission(sessionId);
  const dialogRef = useRef<HTMLDivElement>(null);
  const { t } = useI18n();

  useEffect(() => {
    if (currentRequest && dialogRef.current) {
      dialogRef.current.focus();
    }
  }, [currentRequest]);

  if (!currentRequest || !sessionId) return null;

  const isAllowKind = (kind: string) => kind === 'allow_once' || kind === 'allow_always';
  const firstAllow = currentRequest.options.find(o => isAllowKind(o.kind));

  return (
    <div className={styles.acpPermissionDialogOverlay} role="dialog" aria-modal="true" aria-label={t('permission.ariaLabel')}>
      <div className={styles.acpPermissionDialog} ref={dialogRef} tabIndex={-1}>
        <h3 className={styles.acpPermissionDialogTitle}>{t('permission.title')}</h3>
        <p className={styles.acpPermissionDialogDesc}>
          {t('permission.description')}
        </p>
        <div className={styles.acpPermissionDialogTool}>
          <div className={styles.acpPermissionDialogToolName}>{currentRequest.toolCall.title}</div>
          {currentRequest.toolCall.rawInput != null && (
            <pre className={styles.acpPermissionDialogToolArgs}>
              {JSON.stringify(currentRequest.toolCall.rawInput, null, 2)}
            </pre>
          )}
        </div>
        <div className={styles.acpPermissionDialogActions}>
          {currentRequest.options.map((option) => (
            <button
              key={option.optionId}
              className={`${styles.acpPermissionDialogBtn} ${isAllowKind(option.kind) ? styles.acpPermissionDialogBtnAllow : styles.acpPermissionDialogBtnDeny}`}
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
