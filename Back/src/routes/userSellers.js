import express from 'express';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import UserSellerAssignment from '../models/UserSellerAssignment.js';
import UserDailyQuantity from '../models/UserDailyQuantity.js';

const router = express.Router();

// ============================================
// ASSIGNMENTS
// ============================================

// Get all assignments
router.get('/assignments', requireAuth, requirePageAccess('UserSellerAssignments'), async (req, res) => {
    try {
        const assignments = await UserSellerAssignment.find()
            .populate('user', 'username email role department')
            .populate({
                path: 'seller',
                select: 'ebayMarketplaces user',
                populate: { path: 'user', select: 'username email' }
            })
            .sort({ createdAt: -1 });

        res.json(assignments);
    } catch (err) {
        console.error('Error fetching assignments:', err);
        res.status(500).json({ error: 'Server error fetching assignments' });
    }
});

// Assign seller to user
router.post('/assignments', requireAuth, requirePageAccess('UserSellerAssignments'), async (req, res) => {
    try {
        const { userId, sellerId, dailyTarget } = req.body;

        if (!userId || !sellerId) {
            return res.status(400).json({ error: 'User ID and Seller ID are required' });
        }

        // Check if this specific user-seller pair already exists
        const existing = await UserSellerAssignment.findOne({ user: userId, seller: sellerId });
        if (existing) {
            return res.status(400).json({ error: 'This user is already assigned to this seller.' });
        }

        const assignment = new UserSellerAssignment({
            user: userId,
            seller: sellerId,
            dailyTarget: dailyTarget || 0
        });

        await assignment.save();

        res.status(201).json({ message: 'Assignment created successfully', assignment });
    } catch (err) {
        console.error('Error creating assignment:', err);
        res.status(500).json({ error: 'Server error creating assignment' });
    }
});

// Update assignment daily target
router.patch('/assignments/:id/target', requireAuth, requirePageAccess('UserSellerAssignments'), async (req, res) => {
    try {
        const { id } = req.params;
        const { dailyTarget } = req.body;

        if (dailyTarget === undefined || isNaN(dailyTarget)) {
            return res.status(400).json({ error: 'Valid daily target is required' });
        }

        const assignment = await UserSellerAssignment.findByIdAndUpdate(
            id,
            { dailyTarget: Number(dailyTarget) },
            { new: true }
        );

        if (!assignment) {
            return res.status(404).json({ error: 'Assignment not found' });
        }

        res.json({ message: 'Target updated successfully', assignment });
    } catch (err) {
        console.error('Error updating assignment target:', err);
        res.status(500).json({ error: 'Server error updating assignment target' });
    }
});

// Unassign seller
router.delete('/assignments/:id', requireAuth, requirePageAccess('UserSellerAssignments'), async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await UserSellerAssignment.findByIdAndDelete(id);
        if (!deleted) {
            return res.status(404).json({ error: 'Assignment not found' });
        }
        res.json({ message: 'Unassigned successfully' });
    } catch (err) {
        console.error('Error deleting assignment:', err);
        res.status(500).json({ error: 'Server error deleting assignment' });
    }
});

// ============================================
// PERFORMANCE TRACKING
// ============================================

import { syncDailyQuantities } from '../utils/performanceSync.js';

// Get performance records
router.get('/performance', requireAuth, async (req, res) => {
    try {
        // Sync daily quantities before fetching to ensure today is created and carry-forwards are up to date
        await syncDailyQuantities();

        let query = {};

        // If user is not HR/Superadmin, they can only see their own performance
        const isManager = ['hr', 'hradmin', 'superadmin'].includes(req.user.role);

        if (!isManager) {
            query.user = req.user._id;
        }

        const records = await UserDailyQuantity.find(query)
            .populate('user', 'username email department')
            .populate({
                path: 'seller',
                populate: { path: 'user', select: 'username' }
            })
            .sort({ dateString: -1, createdAt: -1 });

        res.json(records);
    } catch (err) {
        console.error('Error fetching performance:', err);
        res.status(500).json({ error: 'Server error fetching performance' });
    }
});

// Update remarks
router.patch('/performance/:id/remarks', requireAuth, requirePageAccess('UserSellerAssignments'), async (req, res) => {
    try {
        const { id } = req.params;
        const { remarks } = req.body;

        const validRemarks = ['Good', 'Average', 'Need for improvement', ''];
        if (!validRemarks.includes(remarks)) {
            return res.status(400).json({ error: 'Invalid remark value' });
        }

        const record = await UserDailyQuantity.findByIdAndUpdate(
            id,
            { remarks },
            { new: true }
        );

        if (!record) {
            return res.status(404).json({ error: 'Performance record not found' });
        }

        res.json({ message: 'Remarks updated successfully', record });
    } catch (err) {
        console.error('Error updating remarks:', err);
        res.status(500).json({ error: 'Server error updating remarks' });
    }
});

export default router;
