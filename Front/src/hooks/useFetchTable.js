import { useState, useEffect, useRef } from 'react';
import api from '../lib/api';

/**
 * Fetches table data from an API endpoint and manages loading / error / pagination
 * state.  Replaces the repeated `useState([]) + useEffect(api.get)` pattern
 * found across 60+ admin pages.
 *
 * @param {string} url      - API endpoint path (e.g. '/bank-accounts')
 * @param {object} [params] - Query parameters merged into every request.
 *   Treated as reactive: when the serialised value changes the hook resets to
 *   page 1 and re-fetches automatically.
 * @param {object} [options]
 * @param {boolean} [options.paginated=false]  - Add `limit` / `offset` params
 *   and expose `page` / `setPage`.
 * @param {number}  [options.pageSize=20]      - Rows per page (paginated mode).
 * @param {string}  [options.dataKey]          - Key inside the response object
 *   that holds the rows array.  Defaults to `'records'` for object responses;
 *   ignored when the API returns a plain array.
 * @param {string}  [options.totalKey='total'] - Key inside the response object
 *   that holds the total row count (paginated mode).
 * @param {boolean} [options.enabled=true]     - Set to false to skip fetching
 *   (e.g. while a required filter has not been selected yet).
 *
 * @returns {{
 *   rows:    any[],
 *   total:   number,
 *   loading: boolean,
 *   error:   string,
 *   page:    number,
 *   setPage: (page: number) => void,
 *   refetch: () => void,
 * }}
 *
 * @example — simple fetch
 * const { rows: accounts, loading, error, refetch } = useFetchTable('/bank-accounts');
 *
 * @example — paginated fetch with filters
 * const { rows, total, loading, error, page, setPage, refetch } = useFetchTable(
 *   '/csv-storage',
 *   { sellerId, keyword },
 *   { paginated: true, pageSize: 10 },
 * );
 */
export default function useFetchTable(url, params = {}, options = {}) {
    const {
        paginated = false,
        pageSize = 20,
        dataKey = null,
        totalKey = 'total',
        enabled = true,
    } = options;

    const [rows, setRows] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(!!enabled);
    const [error, setError] = useState('');
    const [page, setPage] = useState(1);
    // Increment to trigger a manual refetch without changing any other dep.
    const [seq, setSeq] = useState(0);

    // Stable string key for params — used to detect changes without requiring
    // the caller to memoize the params object.
    const paramsStr = JSON.stringify(params);
    const prevParamsStr = useRef(paramsStr);

    // When external params change, reset page to 1 so stale page numbers are
    // not sent alongside new filter values.
    useEffect(() => {
        if (prevParamsStr.current !== paramsStr) {
            prevParamsStr.current = paramsStr;
            setPage(1);
        }
    }, [paramsStr]); // eslint-disable-line react-hooks/exhaustive-deps

    // Main fetch effect — fires on URL, params, page, or manual refetch change.
    useEffect(() => {
        if (!enabled) {
            setLoading(false);
            return;
        }

        let cancelled = false;
        setLoading(true);
        setError('');

        const reqParams = { ...params };
        if (paginated) {
            reqParams.limit = pageSize;
            reqParams.offset = (page - 1) * pageSize;
        }

        api.get(url, { params: reqParams })
            .then(({ data }) => {
                if (cancelled) return;
                if (Array.isArray(data)) {
                    setRows(data);
                    setTotal(data.length);
                } else {
                    setRows(data[dataKey ?? 'records'] ?? []);
                    setTotal(data[totalKey] ?? 0);
                }
            })
            .catch((err) => {
                if (cancelled) return;
                setError(err.response?.data?.error || 'Failed to load data');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
        // `params` itself is intentionally omitted in favour of `paramsStr` to
        // avoid infinite loops when callers pass inline object literals.
    }, [url, paramsStr, page, paginated, pageSize, dataKey, totalKey, enabled, seq]); // eslint-disable-line react-hooks/exhaustive-deps

    return {
        rows,
        total,
        loading,
        error,
        page,
        setPage,
        refetch: () => setSeq((s) => s + 1),
    };
}
