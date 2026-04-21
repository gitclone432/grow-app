import { Router } from 'express';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import { validate } from '../utils/validate.js';
import { createSalarySchema } from '../schemas/index.js';
import Salary from '../models/Salary.js';

const router = Router();

// GET /api/salary - Fetch all salaries for a specific year
router.get('/', requireAuth, requirePageAccess('Salary'), async (req, res) => {
    try {
        const year = parseInt(req.query.year) || new Date().getFullYear();

        // Find salary records for the year
        const salaries = await Salary.find({ year }).lean();

        // Map salaries
        const formattedSalaries = salaries.map(salary => {
            return {
                _id: salary._id,
                name: salary.name || 'Unknown',
                designation: salary.designation || '',
                year: salary.year,
                jan: salary.jan || { amount: 0, appraisal: 0 },
                feb: salary.feb || { amount: 0, appraisal: 0 },
                mar: salary.mar || { amount: 0, appraisal: 0 },
                apr: salary.apr || { amount: 0, appraisal: 0 },
                may: salary.may || { amount: 0, appraisal: 0 },
                jun: salary.jun || { amount: 0, appraisal: 0 },
                jul: salary.jul || { amount: 0, appraisal: 0 },
                aug: salary.aug || { amount: 0, appraisal: 0 },
                sep: salary.sep || { amount: 0, appraisal: 0 },
                oct: salary.oct || { amount: 0, appraisal: 0 },
                nov: salary.nov || { amount: 0, appraisal: 0 },
                dec: salary.dec || { amount: 0, appraisal: 0 }
            };
        });

        res.json({ salaries: formattedSalaries });
    } catch (error) {
        console.error('Error fetching salaries:', error);
        res.status(500).json({ error: 'Failed to fetch salaries' });
    }
});

// POST /api/salary - Create a new empty salary row
router.post('/', requireAuth, requirePageAccess('Salary'), validate(createSalarySchema), async (req, res) => {
    try {
        const { year, name, designation } = req.body;

        if (!year || !name) {
            return res.status(400).json({ error: 'Year and name are required' });
        }

        const newSalary = new Salary({
            year,
            name,
            designation: designation || ''
        });

        await newSalary.save();
        res.status(201).json(newSalary);
    } catch (error) {
        console.error('Error creating salary:', error);
        res.status(500).json({ error: 'Failed to create salary' });
    }
});

// PUT /api/salary/:id - Update salary for an existing row
router.put('/:id', requireAuth, requirePageAccess('Salary'), async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        // Remove immutable fields if passed
        delete updateData._id;
        delete updateData.year;

        const salary = await Salary.findByIdAndUpdate(
            id,
            { $set: updateData },
            { new: true }
        );

        if (!salary) {
            return res.status(404).json({ error: 'Salary record not found' });
        }

        res.json(salary);
    } catch (error) {
        console.error('Error updating salary:', error);
        res.status(500).json({ error: 'Failed to update salary' });
    }
});

// DELETE /api/salary/:id - Delete a salary row
router.delete('/:id', requireAuth, requirePageAccess('Salary'), async (req, res) => {
    try {
        const { id } = req.params;
        const salary = await Salary.findByIdAndDelete(id);

        if (!salary) {
            return res.status(404).json({ error: 'Salary record not found' });
        }

        res.json({ success: true, message: 'Salary record deleted successfully' });
    } catch (error) {
        console.error('Error deleting salary:', error);
        res.status(500).json({ error: 'Failed to delete salary' });
    }
});

export default router;
