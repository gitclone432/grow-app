import { useState, useEffect } from 'react';

/**
 * Returns a debounced copy of `value` that updates only after `delay` ms of
 * inactivity.  Drop-in replacement for the manual `raw + debounced state pair
 * + useEffect(setTimeout)` pattern used across several pages.
 *
 * @param {*}      value - The value to debounce (string, number, etc.)
 * @param {number} [delay=400] - Debounce delay in milliseconds
 * @returns {*} The debounced value
 *
 * @example
 * const debouncedSearch = useDebounce(searchText, 500);
 * useEffect(() => { fetchResults(debouncedSearch); }, [debouncedSearch]);
 */
export default function useDebounce(value, delay = 400) {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);

    return debounced;
}
