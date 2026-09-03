import { useEffect, useReducer } from 'preact/hooks';
import { _listeners } from './store.js';

// Re-render hook: triggers re-render when any reactive value changes.
export function useStoreVersion() {
  const [, force] = useReducer(x => x + 1, 0);
  useEffect(() => {
    const handler = () => force();
    _listeners.add(handler);
    return () => _listeners.delete(handler);
  }, []);
}
