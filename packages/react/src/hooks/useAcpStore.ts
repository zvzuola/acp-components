import { useStore } from 'zustand/react';
import { acpStore } from '@acp-components/core';

type AcpStoreState = ReturnType<typeof acpStore.getState>;

export function useAcpStore(): AcpStoreState;
export function useAcpStore<T>(selector: (state: AcpStoreState) => T): T;
export function useAcpStore<T>(selector?: (state: AcpStoreState) => T) {
  return useStore(acpStore, selector ?? ((s: AcpStoreState) => s as unknown as T));
}
