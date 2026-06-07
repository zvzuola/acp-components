import React, { useState, useCallback, useRef } from 'react';
import type { AuthMethodEnvVar, AuthMethod } from '@acp-components/core';
import { useAcpStore } from '../../hooks/useAcpStore';
import { useAcpContext } from '../../context/AcpContext';
import { authenticate as coreAuthenticate, acpStore } from '@acp-components/core';
import { authenticateWithEnv } from '@acp-components/core';
import { useI18n } from '../../i18n';
import styles from './login-dialog.module.scss';

const AUTH_TIMEOUT_MS = 300_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Authentication timed out')), ms)),
  ]);
}

function isEnvVarMethod(
  method: AuthMethod,
): method is AuthMethodEnvVar & { type: 'env_var' } {
  return (
    typeof method === 'object' &&
    method !== null &&
    'type' in method &&
    (method as Record<string, unknown>).type === 'env_var'
  );
}

export function LoginDialog() {
  const pendingAuth = useAcpStore((s) => s.pendingAuth);
  const agents = useAcpStore((s) => s.agents);
  const { getClient, isReady } = useAcpContext();
  const { t } = useI18n();
  const [authenticating, setAuthenticating] = useState(false);
  const [error, setError] = useState(false);
  const [activeEnvVarMethod, setActiveEnvVarMethod] = useState<string | null>(null);
  const [envVarValues, setEnvVarValues] = useState<Record<string, string>>({});
  const cancelledRef = useRef(false);

  const doAuth = useCallback(async (methodId: string) => {
    if (!pendingAuth) return;
    const client = getClient(pendingAuth.agentId);
    if (!client) return;
    cancelledRef.current = false;
    setAuthenticating(true);
    setError(false);
    try {
      await withTimeout(coreAuthenticate(client, methodId), AUTH_TIMEOUT_MS);
    } catch {
      if (cancelledRef.current) return;
      setError(true);
      setAuthenticating(false);
    }
  }, [pendingAuth, getClient]);

  const handleEnvVarAuth = useCallback(async (methodId: string) => {
    if (!pendingAuth) return;
    const client = getClient(pendingAuth.agentId);
    if (!client) return;
    const agent = agents.get(pendingAuth.agentId);
    const method = agent?.authMethods?.find((m) => m.id === methodId);
    if (!method || !isEnvVarMethod(method)) return;

    cancelledRef.current = false;
    setAuthenticating(true);
    setError(false);
    try {
      const envVars: Record<string, string> = {};
      for (const v of method.vars) {
        const val = envVarValues[v.name];
        if (!val && !v.optional) {
          throw new Error(`Missing required env var: ${v.name}`);
        }
        if (val) {
          envVars[v.name] = val;
        }
      }
      await withTimeout(authenticateWithEnv(client, pendingAuth.agentId, methodId, envVars), AUTH_TIMEOUT_MS);
    } catch {
      if (cancelledRef.current) return;
      setError(true);
      setAuthenticating(false);
    }
  }, [pendingAuth, getClient, agents, envVarValues]);

  const handleCancel = useCallback(() => {
    cancelledRef.current = true;
    acpStore.getState().clearAuthRequired();
    setActiveEnvVarMethod(null);
    setEnvVarValues({});
  }, []);

  const handleEnvVarChange = useCallback((name: string, value: string) => {
    setEnvVarValues((prev) => ({ ...prev, [name]: value }));
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
          {authMethods.map((method) => {
            if (isEnvVarMethod(method)) {
              const isActive = activeEnvVarMethod === method.id;

              return (
                <div key={method.id} className={styles.acpLoginDialogEnvVar}>
                  {!isActive ? (
                    <button
                      className={styles.acpLoginDialogMethod}
                      onClick={() => setActiveEnvVarMethod(method.id)}
                      disabled={authenticating}
                    >
                      <span className={styles.acpLoginDialogMethodName}>{method.name}</span>
                      {method.description && (
                        <span className={styles.acpLoginDialogMethodDesc}>{method.description}</span>
                      )}
                    </button>
                  ) : (
                    <div className={styles.acpLoginDialogEnvVarForm}>
                      <span className={styles.acpLoginDialogMethodName}>{method.name}</span>
                      {method.vars.map((v) => (
                        <label key={v.name} className={styles.acpLoginDialogEnvVarField}>
                          <span className={styles.acpLoginDialogEnvVarLabel}>
                            {v.label || v.name}
                            {v.optional && (
                              <span className={styles.acpLoginDialogEnvVarOptional}>{t('login.envVarOptional')}</span>
                            )}
                          </span>
                          <input
                            type={v.secret !== false ? 'password' : 'text'}
                            className={styles.acpLoginDialogEnvVarInput}
                            value={envVarValues[v.name] || ''}
                            onChange={(e) => handleEnvVarChange(v.name, e.target.value)}
                            placeholder={t('login.envVarSecretPlaceholder', { label: v.label || v.name })}
                            disabled={authenticating}
                          />
                        </label>
                      ))}
                      <div className={styles.acpLoginDialogEnvVarActions}>
                        <button
                          className={styles.acpLoginDialogCancelBtn}
                          onClick={() => { cancelledRef.current = true; setActiveEnvVarMethod(null); setEnvVarValues({}); setAuthenticating(false); }}
                        >
                          {t('login.cancel')}
                        </button>
                        <button
                          className={styles.acpLoginDialogConfirmBtn}
                          onClick={() => handleEnvVarAuth(method.id)}
                          disabled={authenticating}
                        >
                          {authenticating ? t('login.authenticating') : t('login.authenticate')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            }

            const methodType = (method as { type?: string }).type;

            return (
              <button
                key={method.id}
                className={styles.acpLoginDialogMethod}
                onClick={() => doAuth(method.id)}
                disabled={authenticating}
              >
                <span className={styles.acpLoginDialogMethodName}>{method.name}</span>
                {method.description && (
                  <span className={styles.acpLoginDialogMethodDesc}>{method.description}</span>
                )}
                {methodType === 'terminal' && (
                  <span className={styles.acpLoginDialogMethodTag}>{t('login.methodTerminal')}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className={styles.acpLoginDialogActions}>
          <button
            className={styles.acpLoginDialogCancelBtn}
            onClick={handleCancel}
          >
            {t('login.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
