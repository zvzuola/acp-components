import { useEffect, useRef, useState } from 'react';
import { createAcpProvider } from '@acp-components/core';
import type { AcpProviderOptions } from '@acp-components/core';

export function useAcpProvider(options: AcpProviderOptions) {
  const providerRef = useRef<ReturnType<typeof createAcpProvider> | null>(null);
  const [ready, setReady] = useState(false);

  if (!providerRef.current) {
    providerRef.current = createAcpProvider(options);
  }

  useEffect(() => {
    const provider = providerRef.current!;
    provider.subscribe(() => {
      setReady(provider.ready);
    });
    if (provider.ready) {
      setReady(true);
    }
    return () => {
      provider.destroy();
    };
  }, []);

  return {
    client: providerRef.current.client,
    ready,
    config: options.transport,
    clientInfo: options.clientInfo,
  };
}
