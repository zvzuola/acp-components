import { createContext, useContext } from 'react';
import type { AcpClient } from '../client/AcpClient';
import type { TransportConfig, Implementation } from '../types';

export interface AcpContextValue {
  client: AcpClient;
  config: TransportConfig;
  clientInfo?: Implementation;
}

export const AcpContext = createContext<AcpContextValue | null>(null);

export function useAcpContext(): AcpContextValue {
  const ctx = useContext(AcpContext);
  if (!ctx) {
    throw new Error('useAcpContext must be used within an AcpProvider');
  }
  return ctx;
}
