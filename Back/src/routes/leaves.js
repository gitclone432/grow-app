import { Router } from 'express';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import LeaveRequest from '../models/LeaveRequest.js';
import User from '../models/User.js';
import { validate } from '../utils/validate.js';
import { createLeaveSchema, updateLeaveStatusSchema } from '../schemas/index.js';

const router = Router();

// ============================================================================
// CONFIGURABLE CONSTANTS - Easy to modify
// ============================================================================
const MAX_LEAVES_PER_MONTH = 2; // Maximum days of leave per month per employee
const MAX_PEOPLE_PER_DEPT = 2;  // Maximum people on leave per department per day
const MIN_ADVANCE_DAYS = 2;     // Minimum days in advance to request leave
// ============================================================================

// Helper function to calculate number of days between two dates (inclusive)
function calculateDays(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 for inclusive
    return diffDays;
}

// Helper function to get all dates between start and end (inclusive)
function getDateRange(startDate, endDate) {
    const dates = [];
    const current = new Date(startDate);
    const end = new Date(endDate);

    while (current <= end) {
        dates.push(new Date(current));
        current.setDate(current.getDate() + 1);
    }

    return dates;
}

// POST / - Create a new leave request
router.post('/', requireAuth, validate(createLeaveSchema), async (req, res) => {
    try {
        const { startDate, endDate, reason } = req.body;
        const userId = req.user.userId;

        // Validate required fields
        if (!startDate || !endDate || !reason) {
            return res.status(400).json({ error: 'startDate, endDate, and reason are required' });
        }

        const start = new Date(startDate);
        const end = new Date(endDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Validation 1: startDate must be at least MIN_ADVANCE_DAYS in the future
        const minDate = new Date(today);
        minDate.setDate(minDate.getDate() + MIN_ADVANCE_DAYS);

        if (start < minDate) {
            return res.status(400).json({
                error: `Leave must be requested at least ${MIN_ADVANCE_DAYS} days in advance`
            });
        }

        // Validation 2: endDate must be >= startDate
        if (end < start) {
            return res.status(400).json({ error: 'End date must be after or equal to start date' });
        }

        // Calculate number of days
        const numberOfDays = calculateDays(start, end);

        // Validation 3: Check monthly leave quota
        // Get the month and year of the start date
        const startMonth = start.getMonth();
        const startYear = start.getFullYear();

        // Find all approved/pending leaves for this user in the same month
        const monthStart = new Date(startYear, startMonth, 1);
        const monthEnd = new Date(startYear, startMonth + 1, 0);

        const existingLeaves = await LeaveRequest.find({
            user: userId,
            status: { $in: ['approved', 'pending'] },
            $or: [
                { startDate: { $gte: monthStart, $lte: monthEnd } },
                { endDate: { $gte: monthStart, $lte: monthEnd } },
                { startDate: { $lte: monthStart }, endDate: { $gte: monthEnd } }
            ]
        });

        // Calculate total days already taken/requested in this month
        let totalDaysInMonth = 0;
        for (const leave of existingLeaves) {
            // Only count days that fall within the month
            const leaveStart = new Date(Math.max(leave.startDate, monthStart));
            const leaveEnd = new Date(Math.min(leave.endDate, monthEnd));
            totalDaysInMonth += calculateDays(leaveStart, leaveEnd);
        }

        if (totalDaysInMonth + numberOfDays > MAX_LEAVES_PER_MONTH) {
            return res.status(400).json({
                error: `You have already used ${totalDaysInMonth} days in this month. Maximum is ${MAX_LEAVES_PER_MONTH} days per month.`
            });
        }

        // Validation 4: Check department capacity
        // Get user's department
        const user = await User.findById(userId);
        if (!user.department) {
            return res.status(400).json({ error: 'User must have a department assigned to request leave' });
        }

        // Get all dates in the requested range
        const requestedDates = getDateRange(start, end);

        // For each date, check how many people are already on leave
        for (const date of requestedDates) {
            const dayStart = new Date(date);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(date);
            dayEnd.setHours(23, 59, 59, 999);

            // Find all approved leaves that overlap with this date in the same department
            const overlappingLeaves = await LeaveRequest.find({
                status: 'approved',
                startDate: { $lte: dayEnd },
                endDate: { $gte: dayStart }
            }).populate('user');

            // Count unique users in the same department
            const usersOnLeave = overlappingLeaves.filter(
                leave => leave.user && leave.user.department === user.department && leave.user._id.toString() !== userId
            );

            if (usersOnLeave.length >= MAX_PEOPLE_PER_DEPT) {
                return res.status(400).json({
                    error: `Cannot request leave for ${date.toDateString()}. Maximum ${MAX_PEOPLE_PER_DEPT} people from ${user.department} department are already on leave.`
                });
            }
        }

        // All validations passed - create the leave request
        const leaveRequest = await LeaveRequest.create({
            user: userId,
            startDate: start,
            endDate: end,
            reason,
            numberOfDays,
            status: 'pending'
        });

        res.status(201).json(leaveRequest);
    } catch (error) {
        console.error('Error creating leave request:', error);
        res.status(500).json({ error: 'Failed to create leave request' });
    }
});

// GET / - Get current user's leave requests
router.get('/', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const leaves = await LeaveRequest.find({ user: userId })
            .sort({ startDate: -1 });
        res.json(leaves);
    } catch (error) {
        console.error('Error fetching leaves:', error);
        res.status(500).json({ error: 'Failed to fetch leave requests' });
    }
});

// GET /admin - Get all leave requests (HR Admin and Superadmin only)
router.get('/admin', requireAuth, requirePageAccess('LeaveAdmin'), async (req, res) => {
    try {
        const { status, department } = req.query;

        let query = {};
        if (status) {
            query.status = status;
        }

        const leaves = await LeaveRequest.find(query)
            .populate('user', 'username email department')
            .sort({ createdAt: -1 });

        // Filter by department if specified
        let filteredLeaves = leaves;
        if (department) {
            filteredLeaves = leaves.filter(leave => leave.user && leave.user.department === department);
        }

        res.json(filteredLeaves);
    } catch (error) {
        console.error('Error fetching all leaves:', error);
        res.status(500).json({ error: 'Failed to fetch leave requests' });
    }
});

// PUT /:id/status - Approve or reject a leave request (HR Admin and Superadmin only)
router.put('/:id/status', requireAuth, requirePageAccess('LeaveAdmin'), validate(updateLeaveStatusSchema), async (req, res) => {
    try {
        const { id } = req.params;
        const { status, rejectionReason } = req.body;

        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'Status must be either approved or rejected' });
        }

        if (status === 'rejected' && !rejectionReason) {
            return res.status(400).json({ error: 'Rejection reason is required when rejecting a leave' });
        }

        const leaveRequest = await LeaveRequest.findById(id);
        if (!leaveRequest) {
            return res.status(404).json({ error: 'Leave request not found' });
        }

        if (leaveRequest.status !== 'pending') {
            return res.status(400).json({ error: 'Only pending leave requests can be updated' });
        }

        // If approving, re-validate department capacity
        if (status === 'approved') {
            const user = await User.findById(leaveRequest.user);
            const requestedDates = getDateRange(leaveRequest.startDate, leaveRequest.endDate);

            for (const date of requestedDates) {
                const dayStart = new Date(date);
                dayStart.setHours(0, 0, 0, 0);
                const dayEnd = new Date(date);
                dayEnd.setHours(23, 59, 59, 999);

                const overlappingLeaves = await LeaveRequest.find({
                    status: 'approved',
                    _id: { $ne: id }, // Exclude current request
                    startDate: { $lte: dayEnd },
                    endDate: { $gte: dayStart }
                }).populate('user');

                const usersOnLeave = overlappingLeaves.filter(
                    leave => leave.user && leave.user.department === user.department
                );

                if (usersOnLeave.length >= MAX_PEOPLE_PER_DEPT) {
                    return res.status(400).json({
                        error: `Cannot approve. Maximum ${MAX_PEOPLE_PER_DEPT} people from ${user.department} department are already on leave for ${date.toDateString()}.`
                    });
                }
            }
        }

        leaveRequest.status = status;
        if (status === 'rejected') {
            leaveRequest.rejectionReason = rejectionReason;
        }
        await leaveRequest.save();

        res.json(leaveRequest);
    } catch (error) {
        console.error('Error updating leave status:', error);
        res.status(500).json({ error: 'Failed to update leave request' });
    }
});

// DELETE /:id - Cancel a leave request (Employee only, if pending)
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;

        const leaveRequest = await LeaveRequest.findById(id);
        if (!leaveRequest) {
            return res.status(404).json({ error: 'Leave request not found' });
        }

        // Only the owner can delete their own leave
        if (leaveRequest.user.toString() !== userId) {
            return res.status(403).json({ error: 'You can only cancel your own leave requests' });
        }

        // Only pending leaves can be cancelled
        if (leaveRequest.status !== 'pending') {
            return res.status(400).json({ error: 'Only pending leave requests can be cancelled' });
        }

        await LeaveRequest.findByIdAndDelete(id);
        res.json({ message: 'Leave request cancelled successfully' });
    } catch (error) {
        console.error('Error deleting leave request:', error);
        res.status(500).json({ error: 'Failed to cancel leave request' });
    }
});

export default router;
