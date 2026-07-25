import React, { useCallback, useMemo, useRef, useState } from 'react';
import { KeyOutlined, SearchOutlined, UndoOutlined } from '@ant-design/icons';
import { useI18n } from '../../i18n';
import { useHotkeysContext, type ActionBinding } from '../../context/HotkeysContext';
import { usePlatform } from '../../context/PlatformContext';
import { useKeyCapture, canonicalSpec } from '../../hooks/useKeyCapture';
import type { KeyCaptureResult } from '../../hooks/useKeyCapture';
import styles from './keyboard-shortcuts-panel.module.scss';

// ---------------------------------------------------------------------------
// KeyboardShortcutsPanel - the keyboard-shortcuts settings sub-section.
//
// Lists every action registered via `useActions` (grouped by `submenu`),
// shows each action's RESOLVED shortcut (override ?? default) formatted for
// the host OS, and lets the user rebind it via an inline key-capture flow.
// Overrides are persisted through HotkeysContext (platform.storage), and the
// webview listener + native menu both pick up the resolved spec live.
// ---------------------------------------------------------------------------

/** An action plus its resolved spec, precomputed for the row. */
interface RowAction {
  binding: ActionBinding;
  resolved: string;
  overridden: boolean;
}

/** Group key falls back to a stable "uncategorized" bucket when no submenu. */
const UNCATEGORIZED = '__uncategorized__';

export function KeyboardShortcutsPanel() {
  const { t } = useI18n();
  const { actions, overrides, format, setShortcut, resetShortcut, resetAllShortcuts } =
    useHotkeysContext();
  const platform = usePlatform();
  const os = platform.os;

  const [query, setQuery] = useState('');
  // The action id currently being recorded (null = idle).
  const [recordingId, setRecordingId] = useState<string | null>(null);
  // A conflict surfaced during the last capture, keyed by the recorded id.
  const [conflict, setConflict] = useState<{ id: string; name: string } | null>(null);
  const recordingIdRef = useRef<string | null>(null);

  // id -> resolved spec, fed to the capture hook for conflict detection.
  const resolvedById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const a of actions) m[a.id] = overrides[a.id] ?? a.shortcut;
    return m;
  }, [actions, overrides]);

  // id -> display label, so conflict messages name the colliding action.
  const labelById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const a of actions) m[a.id] = a.label ?? a.id;
    return m;
  }, [actions]);

  const handleCapture = useCallback(
    (result: KeyCaptureResult) => {
      const id = recordingIdRef.current;
      setRecordingId(null);
      recordingIdRef.current = null;
      if (!id) return;
      if (result.spec === null) {
        setConflict(null);
        return;
      }
      if (result.conflictWith) {
        setConflict({ id, name: labelById[result.conflictWith] ?? result.conflictWith });
        return;
      }
      setConflict(null);
      // If the recorded combo equals the default, clear any override rather
      // than storing a redundant entry.
      const def = actions.find((a) => a.id === id)?.shortcut ?? '';
      if (def && canonicalSpec(result.spec, os) === canonicalSpec(def, os)) {
        resetShortcut(id);
      } else {
        setShortcut(id, result.spec);
      }
    },
    [actions, labelById, os, resetShortcut, setShortcut],
  );

  const capture = useKeyCapture({
    os,
    conflicts: resolvedById,
    excludeId: recordingId ?? undefined,
    onCapture: handleCapture,
  });

  const startRecording = useCallback(
    (id: string) => {
      recordingIdRef.current = id;
      setRecordingId(id);
      setConflict(null);
      capture.start();
    },
    [capture],
  );

  // Filter + group actions for display.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows: RowAction[] = actions.map((binding) => {
      const resolved = overrides[binding.id] ?? binding.shortcut;
      return { binding, resolved, overridden: binding.id in overrides };
    });
    const filtered = q
      ? rows.filter((r) => (r.binding.label ?? r.binding.id).toLowerCase().includes(q))
      : rows;

    const byGroup = new Map<string, RowAction[]>();
    for (const r of filtered) {
      const key = r.binding.submenu ?? UNCATEGORIZED;
      const arr = byGroup.get(key) ?? [];
      arr.push(r);
      byGroup.set(key, arr);
    }
    // Stable order: insertion order of actions (Map preserves it).
    return Array.from(byGroup.entries());
  }, [actions, overrides, query]);

  const hasOverrides = Object.keys(overrides).length > 0;

  return (
    <div
      className={styles.acpSettingsViewItems}
      role="list"
      aria-label={t('settingsView.sectionShortcuts')}
    >
      {/* Search */}
      <div className={styles.acpSettingsViewShortcutsToolbar}>
        <label className={styles.acpSettingsViewShortcutsSearch}>
          <SearchOutlined aria-hidden="true" />
          <input
            type="text"
            className={styles.acpSettingsViewShortcutsSearchInput}
            placeholder={t('settingsView.shortcutsSearch')}
            aria-label={t('settingsView.shortcutsSearchAriaLabel')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>

      {groups.length === 0 ? (
        <div className={styles.acpSettingsViewShortcutsEmpty}>
          {t('settingsView.shortcutsEmpty')}
        </div>
      ) : (
        groups.map(([groupKey, rows]) => (
          <React.Fragment key={groupKey}>
            <div className={styles.acpSettingsViewShortcutsGroupTitle}>
              {groupKey === UNCATEGORIZED
                ? t('settingsView.shortcutsUncategorized')
                : groupKey}
            </div>
            {rows.map(({ binding, resolved, overridden }) => {
              const isRecording = recordingId === binding.id;
              const rowConflict =
                conflict && conflict.id === binding.id ? conflict : null;
              return (
                <div
                  key={binding.id}
                  className={styles.acpSettingsViewShortcutsRow}
                  role="listitem"
                >
                  <span className={styles.acpSettingsViewShortcutsRowLabel}>
                    {binding.label ?? binding.id}
                  </span>
                  {rowConflict && (
                    <span className={styles.acpSettingsViewShortcutsConflict}>
                      {t('settingsView.shortcutsConflict', { name: rowConflict.name })}
                    </span>
                  )}
                  <button
                    type="button"
                    className={`${styles.acpSettingsViewShortcutsKbd}${isRecording ? ` ${styles.acpSettingsViewShortcutsKbdRecording}` : ''}`}
                    onClick={() => startRecording(binding.id)}
                    aria-label={binding.label ?? binding.id}
                  >
                    {isRecording
                      ? t('settingsView.shortcutsRecordingHint')
                      : format(resolved) || resolved}
                  </button>
                  {overridden && (
                    <button
                      type="button"
                      className={styles.acpSettingsViewShortcutsReset}
                      onClick={() => {
                        resetShortcut(binding.id);
                        if (conflict?.id === binding.id) setConflict(null);
                      }}
                      aria-label={t('settingsView.shortcutsResetAriaLabel')}
                      title={t('settingsView.shortcutsReset')}
                    >
                      <UndoOutlined />
                    </button>
                  )}
                </div>
              );
            })}
          </React.Fragment>
        ))
      )}

      <div className={styles.acpSettingsViewShortcutsFooter}>
        <button
          type="button"
          className={styles.acpSettingsViewShortcutsResetAll}
          onClick={resetAllShortcuts}
          disabled={!hasOverrides}
        >
          <KeyOutlined />
          {t('settingsView.shortcutsResetAll')}
        </button>
      </div>
    </div>
  );
}
