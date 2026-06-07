import React from 'react';
import { useSession } from '../../hooks/useSession';
import type { SessionId } from '@acp-components/core';
import { useI18n } from '../../i18n';
import styles from './usage-bar.module.scss';

export interface UsageBarProps {
  sessionId: SessionId | null;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

// Ring geometry constants
const RING_RADIUS = 9;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const SVG_SIZE = 24;

export function UsageBar({ sessionId }: UsageBarProps) {
  const { usage } = useSession(sessionId);
  const { t } = useI18n();

  if (!sessionId || !usage) return null;

  const pct = usage.size > 0 ? Math.min((usage.used / usage.size) * 100, 100) : 0;
  const offset = RING_CIRCUMFERENCE * (1 - pct / 100);

  const colorClass = pct > 80 ? styles.acpUsageBarRingFillHigh
    : pct > 50 ? styles.acpUsageBarRingFillMedium
    : styles.acpUsageBarRingFillLow;

  return (
    <div
      className={styles.acpUsageBar}
      role="meter"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={t('usageBar.ariaLabel', { used: formatTokens(usage.used), total: formatTokens(usage.size) })}
    >
      <svg
        className={styles.acpUsageBarRing}
        width={SVG_SIZE}
        height={SVG_SIZE}
        viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
        aria-hidden="true"
      >
        {/* Background track */}
        <circle
          className={styles.acpUsageBarRingTrack}
          cx={SVG_SIZE / 2}
          cy={SVG_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          strokeWidth="1.5"
        />
        {/* Progress arc */}
        <circle
          className={`${styles.acpUsageBarRingFill} ${colorClass}`}
          cx={SVG_SIZE / 2}
          cy={SVG_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${SVG_SIZE / 2} ${SVG_SIZE / 2})`}
        />
      </svg>
      <div className={styles.acpUsageBarTooltip}>
        <span className={styles.acpUsageBarText}>
          {formatTokens(usage.used)}<span className={styles.acpUsageBarTextSep}>/</span>{formatTokens(usage.size)}
        </span>
        {usage.cost && (
          <span className={styles.acpUsageBarCost}>
            {usage.cost.currency}{usage.cost.amount.toFixed(2)}
          </span>
        )}
      </div>
    </div>
  );
}
