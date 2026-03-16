import { onCleanup, onMount } from 'solid-js';
import type { OutputData } from '../../shared/types/ipc';

/**
 * Hook to access the Electron API with proper typing
 */
export function useElectronApi() {
  return window.electronAPI;
}

/**
 * Hook to subscribe to MD output events
 */
export function useMdOutput(callback: (data: OutputData) => void) {
  onMount(() => {
    const cleanup = window.electronAPI.onMdOutput(callback);
    onCleanup(cleanup);
  });
}
