import { Fragment, useEffect, useMemo, useState } from 'react';
import { usePlatform, formatShortcut, type MenuAction } from '@acp-components/react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getMenuActions, onMenuActionsChange, triggerMenuAction } from './tauriPlatform';
import styles from './titlebar.module.scss';

// ---------------------------------------------------------------------------
// Custom in-app titlebar (VS Code-style) for the frameless Tauri window.
//
// Menu items are mirrored into an in-memory store by HotkeysProvider (see
// tauriPlatform.ts) and rendered here directly. Clicks route through
// triggerMenuAction -> platform.menu.onAction, the same contract the native
// menu used, so HotkeysProvider still dispatches to the registered handlers.
// Keyboard shortcuts are unaffected: they flow through the webview useHotkey
// keydown listener, which is now the sole shortcut path (same as the web demo).
//
// Drag regions: data-tauri-drag-region uses e.target (direct target) semantics,
// so the attribute goes on leaf elements (spacer, brand, titlebar root) and
// never on containers that hold buttons.
// ---------------------------------------------------------------------------

/** Subscribe to the in-memory menu-action store. */
function useTauriMenu(): MenuAction[] {
  const [actions, setActions] = useState<MenuAction[]>(() => getMenuActions());
  useEffect(() => {
    setActions(getMenuActions());
    return onMenuActionsChange(() => setActions(getMenuActions()));
  }, []);
  return actions;
}

export function TitleBar() {
  const { os } = usePlatform();
  const actions = useTauriMenu();

  // Group actions by their `submenu` field into ordered [name, items] pairs.
  const menuGroups = useMemo(() => {
    const groups = new Map<string, MenuAction[]>();
    for (const action of actions) {
      const name = action.submenu ?? 'Menu';
      let list = groups.get(name);
      if (!list) {
        list = [];
        groups.set(name, list);
      }
      list.push(action);
    }
    return Array.from(groups.entries());
  }, [actions]);

  const [openMenu, setOpenMenu] = useState<string | null>(null);

  // Close the open dropdown on click-outside or Escape.
  useEffect(() => {
    if (!openMenu) return;
    function onMouseDown(e: MouseEvent) {
      const t = e.target as Node | null;
      if (!t) return;
      if (!t.closest('[data-menubutton]') && !t.closest('[data-dropdown]')) {
        setOpenMenu(null);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenMenu(null);
    }
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openMenu]);

  // Track maximize state for the toggle button glyph.
  const [isMaximized, setIsMaximized] = useState(false);
  useEffect(() => {
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    win.isMaximized().then(setIsMaximized).catch(() => { });
    win
      .onResized(() => {
        win.isMaximized().then(setIsMaximized).catch(() => { });
      })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => { });
    return () => {
      unlisten?.();
    };
  }, []);

  const handleMinimize = () => {
    getCurrentWindow().minimize().catch(() => { });
  };
  const handleToggleMaximize = () => {
    getCurrentWindow().toggleMaximize().catch(() => { });
  };
  const handleClose = () => {
    getCurrentWindow().close().catch(() => { });
  };

  return (
    <div className={styles.titlebar} data-tauri-drag-region="">
      <div className={styles.brand} data-tauri-drag-region="">
        <span className={styles.brandMark} data-tauri-drag-region="">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <rect x="1" y="1" width="12" height="12" rx="3" fill="var(--acp-color-border-accent)" />
            <path
              d="M4 8.5L7 5L10 8.5"
              stroke="var(--acp-color-text-inverse)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className={styles.brandText} data-tauri-drag-region="">
          ACP
        </span>
      </div>

      <nav className={styles.menu}>
        {menuGroups.map(([name, items]) => (
          <div className={styles.menuItem} key={name}>
            <button
              className={`${styles.menuButton}${openMenu === name ? ` ${styles.menuButtonOpen}` : ''}`}
              data-menubutton=""
              onClick={() => setOpenMenu(openMenu === name ? null : name)}
              onMouseEnter={() => {
                if (openMenu !== null) setOpenMenu(name);
              }}
            >
              {name}
            </button>
            {openMenu === name && (
              <div className={styles.dropdown} data-dropdown="">
                {items.map((item) => (
                  <Fragment key={item.id}>
                    {item.separatorBefore && <div className={styles.separator} />}
                    <button
                      className={styles.dropdownItem}
                      disabled={item.enabled === false}
                      onClick={() => {
                        triggerMenuAction(item.id);
                        setOpenMenu(null);
                      }}
                    >
                      <span className={styles.dropdownLabel}>{item.label}</span>
                      {item.shortcut && (
                        <span className={styles.dropdownShortcut}>
                          {formatShortcut(item.shortcut, os)}
                        </span>
                      )}
                    </button>
                  </Fragment>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className={styles.spacer} data-tauri-drag-region="" />

      <div className={styles.controls}>
        <button
          className={styles.control}
          onClick={handleMinimize}
          aria-label="Minimize"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path d="M1 5H9" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
          </svg>
        </button>
        <button
          className={styles.control}
          onClick={handleToggleMaximize}
          aria-label={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
              <rect
                x="2.5"
                y="0.5"
                width="6"
                height="6"
                rx="1"
                stroke="currentColor"
                strokeWidth="1"
                fill="none"
              />
              <rect
                x="0.5"
                y="2.5"
                width="6"
                height="6"
                rx="1"
                stroke="currentColor"
                strokeWidth="1"
                fill="var(--acp-color-bg-secondary)"
              />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
              <rect
                x="1"
                y="1"
                width="8"
                height="8"
                rx="1"
                stroke="currentColor"
                strokeWidth="1"
                fill="none"
              />
            </svg>
          )}
        </button>
        <button
          className={`${styles.control} ${styles.controlClose}`}
          onClick={handleClose}
          aria-label="Close"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path
              d="M1 1L9 9M9 1L1 9"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
