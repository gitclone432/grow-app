import { useState, useEffect } from 'react';
import { Paper, Typography, IconButton, Box, Button, Tooltip, Collapse, Alert } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import StopIcon from '@mui/icons-material/Stop';
import TimerIcon from '@mui/icons-material/Timer';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import MinimizeIcon from '@mui/icons-material/Minimize';
import MaximizeIcon from '@mui/icons-material/Maximize';
import { useAttendance } from '../../context/AttendanceContext';

export default function AttendanceTimer() {
    const { status, attendance, pause, resume, stop, start, isLoading, isStrictTimer } = useAttendance();
    const [elapsedTime, setElapsedTime] = useState(0);
    const [isMinimized, setIsMinimized] = useState(false);

    // Calculate elapsed time for active sessions
    useEffect(() => {
        if (status !== 'active' || !attendance) {
            setElapsedTime(0);
            return;
        }

        const calculateElapsed = () => {
            let total = 0;

            // Add all completed sessions
            for (const session of attendance.sessions) {
                if (session.endTime) {
                    total += new Date(session.endTime) - new Date(session.startTime);
                } else {
                    // Active session
                    total += Date.now() - new Date(session.startTime);
                }
            }

            setElapsedTime(total);
        };

        calculateElapsed();
        const interval = setInterval(calculateElapsed, 1000);

        return () => clearInterval(interval);
    }, [status, attendance]);

    // Format milliseconds to HH:MM
    const msToHHMM = (ms) => {
        if (!ms) return '00:00';
        const totalMinutes = Math.floor(ms / 60000);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    };

    // Format time as HH:MM:SS
    const formatTime = (milliseconds) => {
        const totalSeconds = Math.floor(milliseconds / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    // Don't show timer if not started or if strict timer is disabled
    if (status === 'not_started' || status === 'loading' || !isStrictTimer) {
        return null;
    }

    if (isMinimized) {
        return (
            <Tooltip title={`Work Timer: ${status === 'active' ? formatTime(elapsedTime) : status}`} placement="left">
                <Paper
                    elevation={6}
                    onClick={() => setIsMinimized(false)}
                    sx={{
                        position: 'fixed',
                        bottom: 24,
                        right: 24,
                        width: 56,
                        height: 56,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: 'background.paper',
                        border: 3,
                        borderColor: status === 'active' ? 'success.main' : status === 'paused' ? 'warning.main' : 'grey.500',
                        cursor: 'pointer',
                        zIndex: 1300,
                        transition: 'all 0.3s ease',
                        '&:hover': {
                            transform: 'scale(1.1)'
                        }
                    }}
                >
                    <AccessTimeIcon
                        color={status === 'active' ? 'success' : status === 'paused' ? 'warning' : 'action'}
                        fontSize="large"
                    />
                </Paper>
            </Tooltip>
        );
    }

    return (
        <Paper
            elevation={6}
            sx={{
                position: 'fixed',
                bottom: 24,
                right: 24,
                width: 280,
                backgroundColor: 'background.paper',
                borderLeft: 4,
                borderColor: status === 'active' ? 'success.main' : status === 'paused' ? 'warning.main' : 'grey.500',
                zIndex: 1300,
                transition: 'all 0.3s ease'
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <TimerIcon sx={{ mr: 1, color: 'primary.main' }} />
                    <Typography variant="subtitle2" fontWeight="bold">
                        Work Timer
                    </Typography>
                </Box>
                <Tooltip title="Minimize">
                    <IconButton
                        size="small"
                        onClick={() => setIsMinimized(true)}
                    >
                        <MinimizeIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
            </Box>

            <Collapse in={true}>
                <Box sx={{ px: 2, pb: 2 }}>
                    <Typography variant="h4" sx={{ textAlign: 'center', my: 1, fontFamily: 'monospace', fontWeight: 'bold' }}>
                        {status === 'active' ? formatTime(elapsedTime) : msToHHMM(attendance?.totalWorkTime)}
                    </Typography>

                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mb: 2 }}>
                        {status === 'active' && 'Timer Running'}
                        {status === 'paused' && 'Timer Paused'}
                        {status === 'completed' && 'Day Completed'}
                    </Typography>

                    <Alert severity="info" sx={{ mb: 2, fontSize: '0.75rem', py: 0.5 }}>
                        Timers auto-stop daily at 2:00 AM IST
                    </Alert>

                    <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                        {status === 'active' && (
                            <>
                                <Tooltip title="Pause Timer">
                                    <IconButton
                                        onClick={pause}
                                        disabled={isLoading}
                                        color="warning"
                                        size="large"
                                    >
                                        <PauseIcon />
                                    </IconButton>
                                </Tooltip>
                                <Tooltip title="End Day">
                                    <IconButton
                                        onClick={stop}
                                        disabled={isLoading}
                                        color="error"
                                        size="large"
                                    >
                                        <StopIcon />
                                    </IconButton>
                                </Tooltip>
                            </>
                        )}

                        {status === 'paused' && (
                            <>
                                <Tooltip title="Resume Timer">
                                    <IconButton
                                        onClick={resume}
                                        disabled={isLoading}
                                        color="success"
                                        size="large"
                                    >
                                        <PlayArrowIcon />
                                    </IconButton>
                                </Tooltip>
                                <Tooltip title="End Day">
                                    <IconButton
                                        onClick={stop}
                                        disabled={isLoading}
                                        color="error"
                                        size="large"
                                    >
                                        <StopIcon />
                                    </IconButton>
                                </Tooltip>
                            </>
                        )}

                        {status === 'completed' && (
                            <Button
                                onClick={start}
                                disabled={isLoading}
                                variant="outlined"
                                size="small"
                                fullWidth
                                startIcon={<PlayArrowIcon />}
                                sx={{ textTransform: 'none' }}
                            >
                                Restart Work
                            </Button>
                        )}
                    </Box>
                </Box>
            </Collapse>
        </Paper>
    );
}
