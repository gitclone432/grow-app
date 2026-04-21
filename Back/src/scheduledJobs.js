import cron from 'node-cron';
import Attendance from './models/Attendance.js';
import { runScheduledUploads } from './lib/ebayFeedUpload.js';
import { scheduledSyncAllSellers, scheduledRunAutoCompatForDate } from './routes/ebay.js';

export function initializeScheduledJobs() {
    // Auto-stop all active timers daily at 2:00 AM
    cron.schedule('0 2 * * *', async () => {
        try {
            console.log('[CRON] Running daily timer auto-stop at 2:00 AM...');

            // Find all active attendance records
            const activeRecords = await Attendance.find({ status: 'active' });

            let stoppedCount = 0;

            for (const attendance of activeRecords) {
                // Stop the last active session
                if (attendance.sessions.length > 0) {
                    const lastSession = attendance.sessions[attendance.sessions.length - 1];
                    if (!lastSession.endTime) {
                        lastSession.endTime = new Date();
                    }
                }

                attendance.status = 'completed';
                attendance.calculateTotalWorkTime();
                await attendance.save();

                stoppedCount++;
            }

            console.log(`[CRON] Auto-stopped ${stoppedCount} active timer(s)`);
        } catch (error) {
            console.error('[CRON] Error in auto-stop job:', error);
        }
    }, {
        timezone: 'Asia/Kolkata' // IST timezone
    });

    console.log('[CRON] Scheduled job initialized: Daily timer auto-stop at 2:00 AM IST');

    // Auto-upload scheduled CSVs — runs every minute
    cron.schedule('* * * * *', async () => {
        try {
            await runScheduledUploads();
        } catch (error) {
            console.error('[CRON] Error in scheduled upload job:', error);
        }
    });

    console.log('[CRON] Scheduled job initialized: Auto-upload CSV (every minute)');

    // Poll All Sellers at 1:00 AM IST daily.
    // Syncs eBay listings from lastListingPolledAt up to "now" for every seller.
    // After this runs, the DB will contain the previous day's listings ready for auto-compat.
    cron.schedule('0 1 * * *', async () => {
        try {
            console.log('[CRON] Scheduled Poll All Sellers starting at 1:00 AM IST...');
            await scheduledSyncAllSellers();
        } catch (err) {
            console.error('[CRON] Scheduled Poll All Sellers error:', err.message);
        }
    }, { timezone: 'Asia/Kolkata' });

    console.log('[CRON] Scheduled job initialized: Poll All Sellers at 1:00 AM IST');

    // Run Auto-Compat for the previous IST day at 3:18 AM IST daily.
    // By 3:18 AM the 1:00 AM poll has already finished (~2h18m buffer), so all
    // previous-day listings are in the DB.
    cron.schedule('35 1 * * *', async () => {
        try {
            // Compute yesterday's date in IST (UTC+5:30 = 330 minutes offset)
            const now = new Date();
            const istNow = new Date(now.getTime() + (330 * 60 * 1000));
            const yesterdayIST = new Date(istNow.getTime() - (24 * 60 * 60 * 1000));
            const targetDate = yesterdayIST.toISOString().slice(0, 10); // "YYYY-MM-DD"
            console.log(`[CRON] Scheduled Auto-Compat for ${targetDate} starting at 3:00 AM IST...`);
            await scheduledRunAutoCompatForDate(targetDate);
        } catch (err) {
            console.error('[CRON] Scheduled Auto-Compat error:', err.message);
        }
    }, { timezone: 'Asia/Kolkata' });

    console.log('[CRON] Scheduled job initialized: Auto-Compat Run for Date at 3:00 AM IST');
}
