import { useStore } from 'zustand/react';
import { sessionStore } from '@acp-components/core';

type SessionStoreState = ReturnType<typeof sessionStore.getState>;

export function useSessionStore(): SessionStoreState;
export function useSessionStore<T>(selector: (state: SessionStoreState) => T): T;
export function useSessionStore<T>(selector?: (state: SessionStoreState) => T) {
  return useStore(sessionStore, selector ?? ((s: SessionStoreState) => s as unknown as T));
}
