import React from 'react';
import { useSession } from '@acp-components/core';
import type { SessionId } from '@agentclientprotocol/sdk';
import styles from './usage-bar.module.scss';

export interface UsageBarProps {
  sessionId: SessionId | null;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export function UsageBar({ sessionId }: UsageBarProps) {
  const { usage } = useSession(sessionId);

  if (!sessionId || !usage) return null;

  const pct = usage.size > 0 ? Math.min((usage.used / usage.size) * 100, 100) : 0;
  const fillClass = pct > 80 ? styles.acpUsageBarFillHigh
    : pct > 50 ? styles.acpUsageBarFillMedium
      : styles.acpUsageBarFillLow;

  return (
    <div className={styles.acpUsageBar} role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Context window: ${formatTokens(usage.used)} of ${formatTokens(usage.size)} tokens`}>
      <div className={styles.acpUsageBarWrap}>
        <div
          className={`${styles.acpUsageBarFill} ${fillClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={styles.acpUsageBarText}>
        {formatTokens(usage.used)}/{formatTokens(usage.size)}
      </span>
      {usage.cost && (
        <span className={styles.acpUsageBarCost}>
          {usage.cost.currency} {usage.cost.amount.toFixed(2)}
        </span>
      )}
    </div>
  );
}
