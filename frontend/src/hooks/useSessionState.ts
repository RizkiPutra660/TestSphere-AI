import { useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';

/**
 * Custom hook to persist navigation state across page reloads and hot reloads
 * Automatically saves router state to sessionStorage and restores it on mount
 * 
 * Usage:
 * const myState = useSessionState<MyStateType>('myStateKey');
 */
export function useSessionState<T>(key: string): T | undefined {
  const location = useLocation();
  const [persistedState, setPersistedState] = useState<T | undefined>(() => {
    const stored = sessionStorage.getItem(key);
    return stored ? JSON.parse(stored) : undefined;
  });

  // Save router state to sessionStorage when it changes
  useEffect(() => {
    if (location.state) {
      // Get the first value property from location.state (usually the main state object)
      const stateValue = Object.values(location.state)[0];
      if (stateValue) {
        sessionStorage.setItem(key, JSON.stringify(stateValue));
        setPersistedState(stateValue as T);
      }
    }
  }, [location.state, key]);

  return persistedState;
}

/**
 * Clear session state for a specific key
 */
export function clearSessionState(key: string): void {
  sessionStorage.removeItem(key);
}

/**
 * Clear all session state
 */
export function clearAllSessionState(): void {
  sessionStorage.clear();
}
