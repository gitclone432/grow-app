import { Dialog, DialogContent, Typography, Button, Box, Chip } from '@mui/material';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { useAttendance } from '../../context/AttendanceContext';

export default function TimerPausedModal() {
    const { status, isStrictTimer, attendance, resume, stop, isLoading } = useAttendance();

    // Show only when strict timer is on and timer is paused
    if (!isStrictTimer || status !== 'paused') return null;

    // Format totalWorkTime in ms to HH:MM
    const msToHHMM = (ms) => {
        if (!ms) return '00:00';
        const totalMinutes = Math.floor(ms / 60000);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    };

    const handleResume = async () => {
        try {
            await resume();
        } catch (error) {
            console.error('Failed to resume timer:', error);
            alert('Failed to resume timer. Please try again.');
        }
    };

    const handleStop = async () => {
        try {
            await stop();
        } catch (error) {
            console.error('Failed to end day:', error);
            alert('Failed to end day. Please try again.');
        }
    };

    return (
        <Dialog
            open={true}
            disableEscapeKeyDown
            PaperProps={{
                sx: {
                    minWidth: { xs: '90vw', sm: 420 },
                    borderRadius: 3,
                    overflow: 'hidden',
                    boxShadow: '0 24px 60px rgba(0,0,0,0.2)',
                }
            }}
        >
            {/* Colored top bar */}
            <Box sx={{
                height: 6,
                background: 'linear-gradient(90deg, #f59e0b, #d97706)',
            }} />

            <DialogContent sx={{ textAlign: 'center', py: 5, px: 4 }}>
                {/* Icon */}
                <Box sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 88,
                    height: 88,
                    borderRadius: '50%',
                    bgcolor: 'warning.light',
                    mb: 3,
                    mx: 'auto',
                }}>
                    <PauseCircleIcon sx={{ fontSize: 52, color: 'warning.dark' }} />
                </Box>

                <Typography variant="h5" fontWeight="bold" gutterBottom>
                    Timer Paused
                </Typography>

                <Typography variant="body2" color="text.secondary" sx={{ mb: 3, lineHeight: 1.6 }}>
                    Your work timer was paused — this may have happened automatically
                    when you closed or refreshed the tab.
                </Typography>

                {/* Elapsed hours chip */}
                <Box sx={{ display: 'flex', justifyContent: 'center', mb: 4 }}>
                    <Chip
                        icon={<AccessTimeIcon />}
                        label={`${msToHHMM(attendance?.totalWorkTime)} logged so far`}
                        color="warning"
                        variant="outlined"
                        sx={{ fontSize: '0.95rem', px: 1, py: 2.5, fontWeight: 600 }}
                    />
                </Box>

                {/* Resume button (primary action) */}
                <Button
                    variant="contained"
                    size="large"
                    startIcon={<PlayArrowIcon />}
                    onClick={handleResume}
                    disabled={isLoading}
                    fullWidth
                    sx={{
                        py: 1.5,
                        fontSize: '1rem',
                        fontWeight: 'bold',
                        textTransform: 'none',
                        borderRadius: 2,
                        bgcolor: 'success.main',
                        '&:hover': { bgcolor: 'success.dark' },
                        mb: 1.5
                    }}
                >
                    {isLoading ? 'Resuming…' : 'Resume Work'}
                </Button>

                {/* End Day button (secondary action) */}
                <Button
                    variant="outlined"
                    size="large"
                    startIcon={<StopIcon />}
                    onClick={handleStop}
                    disabled={isLoading}
                    fullWidth
                    color="error"
                    sx={{
                        py: 1.5,
                        fontSize: '1rem',
                        fontWeight: 'bold',
                        textTransform: 'none',
                        borderRadius: 2,
                    }}
                >
                    {isLoading ? 'Ending…' : 'End Day Instead'}
                </Button>

                <Typography variant="caption" color="text.secondary" sx={{ mt: 2.5, display: 'block' }}>
                    Timers auto-stop daily at 2:00 AM IST
                </Typography>
            </DialogContent>
        </Dialog>
    );
}
