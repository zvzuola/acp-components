import { PlatformContext, type PlatformProviderProps } from '../../context/PlatformContext';
import { PlatformFileTreeAuto } from './PlatformFileTreeAuto';
import { PlatformFileViewerAuto } from './PlatformFileViewerAuto';
import { PlatformWorkspacesAuto } from './PlatformWorkspacesAuto';

/**
 * Root provider that injects a host `Platform` into the React tree.
 *
 * Sits at the very top of the host app (above `I18nProvider` and `AcpProvider`)
 * since both i18n and core need platform capabilities. By default it also
 * mounts:
 *  - {@link PlatformWorkspacesAuto} — loads/saves the workspace list via
 *    `platform.storage('workspaces')` (zero-config persistence);
 *  - {@link PlatformFileTreeAuto} — drives the per-workspace file tree from
 *    `platform.fs.readDirectory` / `platform.fs.watchFileTree`;
 *  - {@link PlatformFileViewerAuto} — wires `platform.fs.readFileContent` /
 *    `platform.openExternalEditor` to the global file-viewer store.
 * Pass `autoWorkspaces={false}` / `autoFileTree={false}` /
 * `autoFileViewer={false}` to wire a bespoke setup instead.
 *
 * This is the platform-side counterpart to `AcpProvider`: the latter injects
 * agent-connection state, this one injects native capabilities. The two are
 * orthogonal by design (see the `Platform` doc comment in PlatformContext).
 */
export function PlatformProvider({
  platform,
  children,
  autoWorkspaces = true,
  autoFileTree = true,
  autoFileViewer = true,
}: PlatformProviderProps) {
  return (
    <PlatformContext.Provider value={platform}>
      {autoWorkspaces && <PlatformWorkspacesAuto />}
      {autoFileTree && <PlatformFileTreeAuto />}
      {autoFileViewer && <PlatformFileViewerAuto />}
      {children}
    </PlatformContext.Provider>
  );
}
