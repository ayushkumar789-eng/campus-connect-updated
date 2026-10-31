import { useState, useEffect } from 'react';

/**
 * Debounces a rapidly changing value. Used by search so we issue one request
 * per pause instead of one per keystroke.
 *
 * @template T
 * @param {T} value
 * @param {number} delay
 * @returns {T}
 */
export function useDebounce(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
