import { useLocation } from 'react-router-dom';
import { useEffect, useRef } from 'react';

/**
 * Persists React Router location.state to sessionStorage so it survives
 * page refreshes. Each page should use a unique storageKey.
 *
 * Usage:
 *   const state = usePersistedLocationState<MyStateType>('integrationTest');
 *
 * On first visit:  location.state is populated → saved to sessionStorage
 * On refresh:      location.state is null       → restored from sessionStorage
 */
export function usePersistedLocationState<T>(storageKey: string): T | null {
  const location = useLocation();
  const liveState = location.state as T | null;
  const key = `nav_state_${storageKey}`;

  // Save whenever we have real state (i.e. a navigation happened)
  const savedRef = useRef(false);
  useEffect(() => {
    if (liveState) {
      sessionStorage.setItem(key, JSON.stringify(liveState));
      savedRef.current = true;
    }
  }, [liveState, key]);

  // Return live state if available, otherwise fall back to sessionStorage
  if (liveState) return liveState;

  const stored = sessionStorage.getItem(key);
  return stored ? (JSON.parse(stored) as T) : null;
}

/**
 * Clear the persisted state for a specific page key (e.g. on logout or
 * explicit "back to dashboard" navigation).
 */
export function clearPersistedLocationState(storageKey: string): void {
  sessionStorage.removeItem(`nav_state_${storageKey}`);
}
