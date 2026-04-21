import express from 'express';
import { validate } from '../utils/validate.js';
import { createIdeaSchema, addIdeaCommentSchema } from '../schemas/index.js';
import Idea from '../models/Idea.js';

const router = express.Router();

// Get all ideas/tickets with pagination and filters
// PUBLIC ROUTE - No authentication required
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      status, 
      priority, 
      type,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = {};
    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (type) query.type = type;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOptions = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const ideas = await Idea.find(query)
      .sort(sortOptions)
      .limit(parseInt(limit))
      .skip(skip)
      .lean();

    const total = await Idea.countDocuments(query);

    res.json({
      ideas,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      limit: parseInt(limit)
    });
  } catch (err) {
    console.error('Error fetching ideas:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get single idea by ID
// PUBLIC ROUTE
router.get('/:id', async (req, res) => {
  try {
    const idea = await Idea.findById(req.params.id).lean();
    if (!idea) {
      return res.status(404).json({ error: 'Idea not found' });
    }
    res.json(idea);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new idea/ticket
// PUBLIC ROUTE - Anyone can submit
router.post('/', validate(createIdeaSchema), async (req, res) => {
  try {
    const { title, description, type, priority, createdBy, completeByDate } = req.body;

    const newIdea = await Idea.create({
      title,
      description,
      type: type || 'idea',
      priority: priority || 'medium',
      createdBy,
      status: 'open',
      completeByDate: completeByDate || undefined
    });

    res.status(201).json(newIdea);
  } catch (err) {
    console.error('Error creating idea:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update idea (status, priority, assignee, etc.)
// PUBLIC ROUTE - But you might want to restrict this later
router.patch('/:id', async (req, res) => {
  try {
    const { status, priority, assignedTo, pickedUpBy, resolvedBy, completeByDate, notes } = req.body;
    
    console.log('PATCH /ideas/:id', { id: req.params.id, pickedUpBy });
    
    const updateData = {};
    if (status) updateData.status = status;
    if (priority) updateData.priority = priority;
    if (assignedTo) updateData.assignedTo = assignedTo;
    if (pickedUpBy !== undefined) updateData.pickedUpBy = pickedUpBy || null;
    if (completeByDate !== undefined) updateData.completeByDate = completeByDate;
    if (notes !== undefined) updateData.notes = notes;
    
    console.log('Update data:', updateData);
    
    if (status === 'completed' && !req.body.resolvedAt) {
      updateData.resolvedAt = new Date();
      if (resolvedBy) updateData.resolvedBy = resolvedBy;
    }

    const idea = await Idea.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!idea) {
      return res.status(404).json({ error: 'Idea not found' });
    }

    console.log('Updated idea pickedUpBy:', idea.pickedUpBy);
    res.json(idea);
  } catch (err) {
    console.error('Error updating idea:', err);
    res.status(500).json({ error: err.message });
  }
});

// Add comment to an idea
// PUBLIC ROUTE
router.post('/:id/comments', validate(addIdeaCommentSchema), async (req, res) => {
  try {
    const { text, commentedBy } = req.body;

    if (!text || !commentedBy) {
      return res.status(400).json({ error: 'Text and commentedBy are required' });
    }

    const idea = await Idea.findById(req.params.id);
    if (!idea) {
      return res.status(404).json({ error: 'Idea not found' });
    }

    idea.comments.push({
      text,
      commentedBy,
      commentedAt: new Date()
    });

    await idea.save();
    res.json(idea);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete idea
// PUBLIC ROUTE - But you might want to restrict this to admins only
router.delete('/:id', async (req, res) => {
  try {
    const idea = await Idea.findByIdAndDelete(req.params.id);
    if (!idea) {
      return res.status(404).json({ error: 'Idea not found' });
    }
    res.json({ message: 'Idea deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get statistics
// PUBLIC ROUTE
router.get('/stats/summary', async (req, res) => {
  try {
    const [total, open, inProgress, completed, byPriority] = await Promise.all([
      Idea.countDocuments(),
      Idea.countDocuments({ status: 'open' }),
      Idea.countDocuments({ status: 'in-progress' }),
      Idea.countDocuments({ status: 'completed' }),
      Idea.aggregate([
        { $group: { _id: '$priority', count: { $sum: 1 } } }
      ])
    ]);

    const priorityMap = byPriority.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

    res.json({
      total,
      byStatus: { open, inProgress, completed },
      byPriority: {
        low: priorityMap.low || 0,
        medium: priorityMap.medium || 0,
        high: priorityMap.high || 0
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
