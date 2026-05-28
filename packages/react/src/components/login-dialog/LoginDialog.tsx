import React, { useState, useCallback } from 'react';
import { useAcpStore } from '../../hooks/useAcpStore';
import { useAcpContext } from '../../context/AcpContext';
import { authenticate as coreAuthenticate, acpStore } from '@acp-components/core';
import { useI18n } from '../../i18n';
import styles from './login-dialog.module.scss';

export function LoginDialog() {
  const pendingAuth = useAcpStore((s) => s.pendingAuth);
  const agents = useAcpStore((s) => s.agents);
  const { getClient, isReady } = useAcpContext();
  const { t } = useI18n();
  const [authenticating, setAuthenticating] = useState(false);
  const [error, setError] = useState(false);

  const handleAuth = useCallback(async (methodId: string) => {
    if (!pendingAuth) return;
    const client = getClient(pendingAuth.agentId);
    if (!client) return;
    setAuthenticating(true);
    setError(false);
    try {
      await coreAuthenticate(client, methodId);
    } catch {
      setError(true);
      setAuthenticating(false);
    }
  }, [pendingAuth, getClient]);

  const handleCancel = useCallback(() => {
    acpStore.getState().clearAuthRequired();
  }, []);

  if (!pendingAuth || !isReady) return null;

  const agent = agents.get(pendingAuth.agentId);
  const authMethods = agent?.authMethods ?? [];

  return (
    <div className={styles.acpLoginDialogOverlay} role="dialog" aria-modal="true" aria-label={t('login.ariaLabel')}>
      <div className={styles.acpLoginDialog} tabIndex={-1}>
        <h3 className={styles.acpLoginDialogTitle}>{t('login.title')}</h3>
        <p className={styles.acpLoginDialogDesc}>{t('login.description')}</p>

        {error && (
          <p className={styles.acpLoginDialogError}>{t('login.error')}</p>
        )}

        <div className={styles.acpLoginDialogMethods}>
          {authMethods.map((method) => (
            <button
              key={method.id}
              className={styles.acpLoginDialogMethod}
              onClick={() => handleAuth(method.id)}
              disabled={authenticating}
            >
              <span className={styles.acpLoginDialogMethodName}>{method.name}</span>
              {method.description && (
                <span className={styles.acpLoginDialogMethodDesc}>{method.description}</span>
              )}
            </button>
          ))}
        </div>

        <div className={styles.acpLoginDialogActions}>
          <button
            className={styles.acpLoginDialogCancelBtn}
            onClick={handleCancel}
            disabled={authenticating}
          >
            {authenticating ? t('login.authenticating') : t('login.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
