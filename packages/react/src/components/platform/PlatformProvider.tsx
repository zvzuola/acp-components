import { PlatformContext, type PlatformProviderProps } from '../../context/PlatformContext';
import { PlatformFileTreeAuto } from './PlatformFileTreeAuto';
import { PlatformFileViewerAuto } from './PlatformFileViewerAuto';

/**
 * Root provider that injects a host `Platform` into the React tree.
 *
 * Sits at the very top of the host app (above `I18nProvider` and `AcpProvider`)
 * since both i18n and core need platform capabilities. By default it also
 * mounts {@link PlatformFileTreeAuto}, which drives the per-workspace file
 * tree from `platform.readDirectory` / `platform.watchFileTree`, and
 * {@link PlatformFileViewerAuto}, which wires `platform.readFileContent` /
 * `platform.onOpenFile` to the global file-viewer store — zero-config.
 * Pass `autoFileTree={false}` / `autoFileViewer={false}` to wire a bespoke
 * setup instead.
 *
 * This is the platform-side counterpart to `AcpProvider`: the latter injects
 * agent-connection state, this one injects native capabilities. The two are
 * orthogonal by design (see the `Platform` doc comment in PlatformContext).
 */
export function PlatformProvider({
  platform,
  children,
  autoFileTree = true,
  autoFileViewer = true,
}: PlatformProviderProps) {
  return (
    <PlatformContext.Provider value={platform}>
      {autoFileTree && <PlatformFileTreeAuto />}
      {autoFileViewer && <PlatformFileViewerAuto />}
      {children}
    </PlatformContext.Provider>
  );
}
