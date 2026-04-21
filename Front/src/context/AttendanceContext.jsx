import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getAttendanceStatus, startTimer, pauseTimer, resumeTimer, stopTimer, getAuthToken } from '../lib/api';

const AttendanceContext = createContext();

export function useAttendance() {
    const context = useContext(AttendanceContext);
    if (!context) {
        throw new Error('useAttendance must be used within AttendanceProvider');
    }
    return context;
}

export function AttendanceProvider({ children, user }) {
    const [status, setStatus] = useState('loading'); // 'loading', 'not_started', 'active', 'paused', 'completed'
    const [attendance, setAttendance] = useState(null);
    const [isStrictTimer, setIsStrictTimer] = useState(false);
    const [totalHours, setTotalHours] = useState('0.00');
    const [isLoading, setIsLoading] = useState(false);
    const abortControllerRef = useRef(null);

    // Fetch initial status
    const fetchStatus = useCallback(async () => {
        if (!user) {
            setStatus('not_started');
            return;
        }

        // Cancel any previous in-flight request before starting a new one
        if (abortControllerRef.current) abortControllerRef.current.abort();
        abortControllerRef.current = new AbortController();

        try {
            const response = await getAttendanceStatus(abortControllerRef.current.signal);
            setStatus(response.status || 'not_started');
            setAttendance(response.attendance);
            setIsStrictTimer(response.isStrictTimer);
            setTotalHours(response.totalHours || '0.00');
        } catch (error) {
            // Ignore intentional aborts (unmount, tab switch, rapid re-fetch)
            if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') return;
            console.error('Failed to fetch attendance status:', error);
            // Don't reset status on network error, otherwise the user might 
            // see the "Start Timer" popup during server redeploys.
            // If the initial load fails, it will start as 'not_started' or keep 'loading'
            if (status === 'loading') {
                setStatus('not_started');
            }
        }
    }, [user, status]);

    useEffect(() => {
        fetchStatus(); // initial load

        // Poll every 60s (only needed to catch rare admin force-stops / cron events)
        const interval = setInterval(() => {
            // Skip polling if the tab is hidden — no need to sync when user isn't looking
            if (document.visibilityState === 'visible') {
                fetchStatus();
            }
        }, 60000);

        // When user returns to this tab, immediately re-sync
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                fetchStatus();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            if (abortControllerRef.current) abortControllerRef.current.abort();
        };
    }, [fetchStatus]);

    // Auto-pause timer when user closes tab, closes browser, or refreshes page
    useEffect(() => {
        const handleBeforeUnload = () => {
            if (status === 'active') {
                const token = getAuthToken();
                const apiUrl = import.meta.env.VITE_API_URL;
                if (token && apiUrl) {
                    // fetch with keepalive:true is more reliable than sendBeacon —
                    // it survives tab/browser close AND supports proper Authorization headers.
                    // sendBeacon can't set headers so CORS often silently blocks it.
                    fetch(`${apiUrl}/attendance/pause`, {
                        method: 'POST',
                        keepalive: true,
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    }).catch(() => { }); // fire-and-forget; page is already unloading
                }
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [status]);

    const start = async () => {
        setIsLoading(true);
        try {
            const response = await startTimer();
            setStatus('active');
            setAttendance(response.attendance);
            await fetchStatus(); // Refresh to get latest
        } catch (error) {
            console.error('Failed to start timer:', error);
            throw error;
        } finally {
            setIsLoading(false);
        }
    };

    const pause = async () => {
        setIsLoading(true);
        try {
            const response = await pauseTimer();
            setStatus('paused');
            setAttendance(response.attendance);
            await fetchStatus();
        } catch (error) {
            console.error('Failed to pause timer:', error);
            throw error;
        } finally {
            setIsLoading(false);
        }
    };

    const resume = async () => {
        setIsLoading(true);
        try {
            const response = await resumeTimer();
            setStatus('active');
            setAttendance(response.attendance);
            await fetchStatus();
        } catch (error) {
            console.error('Failed to resume timer:', error);
            throw error;
        } finally {
            setIsLoading(false);
        }
    };

    const stop = async () => {
        setIsLoading(true);
        try {
            const response = await stopTimer();
            setStatus('completed');
            setAttendance(response.attendance);
            setTotalHours(response.totalHours || '0.00');
            await fetchStatus();
        } catch (error) {
            console.error('Failed to stop timer:', error);
            throw error;
        } finally {
            setIsLoading(false);
        }
    };

    const value = {
        status,
        attendance,
        isStrictTimer,
        totalHours,
        isLoading,
        start,
        pause,
        resume,
        stop,
        refresh: fetchStatus
    };

    return (
        <AttendanceContext.Provider value={value}>
            {children}
        </AttendanceContext.Provider>
    );
}
