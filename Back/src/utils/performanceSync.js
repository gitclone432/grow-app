import moment from 'moment-timezone';
import UserSellerAssignment from '../models/UserSellerAssignment.js';
import UserDailyQuantity from '../models/UserDailyQuantity.js';

/**
 * Synchronize and calculate target quantities for all active assignments.
 * This ensures that UserDailyQuantity records exist up to the current day,
 * applying carry-forward logic if the target was not met on the previous day.
 */
export async function syncDailyQuantities() {
    try {
        console.log('[Performance Sync] Starting synchronization of daily targets');

        // Use local timezone for "today"
        const todayDateString = moment().format('YYYY-MM-DD');

        // 1. Get all active assignments that have a daily target set
        const assignments = await UserSellerAssignment.find({ dailyTarget: { $gt: 0 } });

        if (assignments.length === 0) {
            console.log('[Performance Sync] No assignments with a daily target found.');
            return;
        }

        for (const assignment of assignments) {
            const userId = assignment.user;
            const sellerId = assignment.seller;
            const dailyTarget = assignment.dailyTarget || 0;

            // Find the most recent record for this user/seller combo
            const mostRecentRecord = await UserDailyQuantity.findOne({
                user: userId,
                seller: sellerId
            }).sort({ dateString: -1 });

            let loopStartDate;

            // Determine starting point for syncing mapping
            if (mostRecentRecord) {
                // If there's already a record, start from the day AFTER the most recent record
                const lastRecordDate = moment(mostRecentRecord.dateString, 'YYYY-MM-DD');
                if (lastRecordDate.format('YYYY-MM-DD') >= todayDateString) {
                    // Already up to date (or logically ahead)
                    continue;
                }
                loopStartDate = lastRecordDate.add(1, 'day');
            } else {
                // If no records at all, we could theoretically start from the assignment creation date
                // or just start from today. Let's start from today for a clean slate, 
                // but if we want to honor old assignments, we start from assignment creation date.
                loopStartDate = moment(assignment.createdAt).startOf('day');
                // Ensure we don't start in the future somehow
                if (loopStartDate.format('YYYY-MM-DD') > todayDateString) {
                    continue;
                }
            }

            // Get previous day's effective target and completed quantity to determine initial carry forward
            let carryForward = 0;
            if (mostRecentRecord) {
                carryForward = Math.max(0, (mostRecentRecord.targetQuantity || 0) - (mostRecentRecord.quantity || 0));
            }

            // Loop from the start date up to today (inclusive)
            let currentDate = loopStartDate;
            let currentCarryForward = carryForward;

            const currentObjDate = currentDate.format('YYYY-MM-DD');
            let isPastOrToday = currentObjDate <= todayDateString;

            while (isPastOrToday) {
                const dateStr = currentDate.format('YYYY-MM-DD');

                // Calculate today's target
                const thisDaysTarget = dailyTarget + currentCarryForward;

                // We try to find the record first, just in case there's an anomaly or it was created directly
                let record = await UserDailyQuantity.findOne({
                    user: userId,
                    seller: sellerId,
                    dateString: dateStr
                });

                if (record) {
                    // Update the target quantity of the existing record
                    if (record.targetQuantity !== thisDaysTarget) {
                        record.targetQuantity = thisDaysTarget;
                        await record.save();
                    }

                    // The carry forward for the next day iteration
                    currentCarryForward = Math.max(0, thisDaysTarget - (record.quantity || 0));
                } else {
                    // Create a new record with quantity 0
                    record = new UserDailyQuantity({
                        user: userId,
                        seller: sellerId,
                        dateString: dateStr,
                        quantity: 0,
                        targetQuantity: thisDaysTarget
                    });

                    await record.save();

                    // Carry forward is the entire target since quantity is 0
                    currentCarryForward = thisDaysTarget;
                }

                // Next day
                currentDate.add(1, 'day');
                isPastOrToday = currentDate.format('YYYY-MM-DD') <= todayDateString;
            }
        }

        console.log('[Performance Sync] Finished synchronization of daily targets');

    } catch (error) {
        console.error('[Performance Sync] Error during sync:', error);
    }
}
