import { useEffect, useRef } from 'react';
import { createFileSystemProvider } from '@acp-components/core';
import type { FileSystemProviderOptions, FileSystemProviderInstance } from '@acp-components/core';

export function useFileSystemProvider(options: FileSystemProviderOptions) {
  const providerRef = useRef<FileSystemProviderInstance | null>(null);

  if (!providerRef.current) {
    providerRef.current = createFileSystemProvider(options);
  }

  useEffect(() => {
    return () => {
      providerRef.current?.destroy();
      providerRef.current = null;
    };
  }, []);

  return providerRef.current;
}
