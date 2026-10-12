import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../lib/api';

/**
 * Where to pick up in one seller's stock check verify list: the furthest row
 * with an ended listing — by anyone, on any device — worked out by the server from
 * the end-listing log (ends made from that page only), plus how many rows
 * still have a live listing and which is first. Call `refresh` after ending
 * listings. Pass a null path when no seller is selected.
 *
 * @param {string|null} path - the list's resume-point endpoint; null while there is no run
 * @param {object} params - the list's filter params (same as the list request)
 * @returns {{ resumePoint: {itemId: string, sku: string, position: number, endedAt: string, endedBy: string}|null,
 *             live: {count: number, first: {itemId: string, sku: string, position: number}|null}|null,
 *             refresh: () => void }}
 *   `live` is null for lists too big to count, or when the scan ran out of time.
 */
export default function useVerifyResumePoint(path, params) {
    const key = path ? `${path}?${JSON.stringify(params)}` : null;
    const [result, setResult] = useState({ resumePoint: null, live: null });
    // Responses for a list the user has since switched away from are dropped.
    const keyRef = useRef(key);
    keyRef.current = key;

    // Keyed on `key` alone: it is built from path and params, and params is a
    // fresh object each render, so listing it would refetch on every render.
    const refresh = useCallback(() => {
        if (!key) return;
        api.get(path, { params })
            .then(({ data }) => {
                if (keyRef.current === key) setResult({ resumePoint: data?.resumePoint || null, live: data?.live || null });
            })
            .catch(() => {});
    }, [key]);

    useEffect(() => {
        setResult({ resumePoint: null, live: null });
        refresh();
    }, [refresh]);

    return { ...result, refresh };
}
