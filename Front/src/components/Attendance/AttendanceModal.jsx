import { Dialog, DialogContent, Typography, Button, Box, Alert } from '@mui/material';
import TimerIcon from '@mui/icons-material/Timer';
import { useAttendance } from '../../context/AttendanceContext';

export default function AttendanceModal() {
    const { status, isStrictTimer, start, isLoading } = useAttendance();

    // Show modal only if strict timer is enabled and timer hasn't started
    const showModal = isStrictTimer && status === 'not_started';

    const handleStart = async () => {
        try {
            await start();
        } catch (error) {
            console.error('Failed to start timer:', error);
            alert('Failed to start timer. Please try again.');
        }
    };

    return (
        <Dialog
            open={showModal}
            disableEscapeKeyDown
            PaperProps={{
                sx: {
                    minWidth: 400,
                    backdropFilter: 'blur(10px)',
                    backgroundColor: 'rgba(255, 255, 255, 0.95)'
                }
            }}
        >
            <DialogContent sx={{ textAlign: 'center', py: 4, px: 3 }}>
                <TimerIcon sx={{ fontSize: 80, color: 'primary.main', mb: 2 }} />

                <Typography variant="h5" gutterBottom fontWeight="bold">
                    Start Your Work Day
                </Typography>

                <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                    Please click the button below to start tracking your working hours for today.
                </Typography>

                <Button
                    variant="contained"
                    size="large"
                    onClick={handleStart}
                    disabled={isLoading}
                    fullWidth
                    sx={{
                        py: 1.5,
                        fontSize: '1.1rem',
                        fontWeight: 'bold',
                        textTransform: 'none'
                    }}
                >
                    {isLoading ? 'Starting...' : 'Start Work'}
                </Button>

                <Alert severity="info" sx={{ mt: 2, fontSize: '0.85rem' }}>
                    <strong>Note:</strong> Timers automatically stop daily at 2:00 AM IST
                </Alert>

                <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
                    You must start your timer to access the application
                </Typography>
            </DialogContent>
        </Dialog>
    );
}
