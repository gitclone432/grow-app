import express from 'express';
import mongoose from 'mongoose';
import CardFundRequest from '../models/CardFundRequest.js';
import CreditCard from '../models/CreditCard.js';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';

const router = express.Router();

// GET /api/card-fund-requests - Get all fund requests (with filtering)
router.get('/', requireAuth, async (req, res) => {
  try {
    const { status, cardId } = req.query;
    const filter = {};
    
    if (status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
      filter.status = status;
    }
    
    if (cardId && mongoose.Types.ObjectId.isValid(cardId)) {
      filter.card = cardId;
    }
    
    const requests = await CardFundRequest.find(filter)
      .populate('card', 'name last4digits balance')
      .populate('requestedBy', 'username')
      .populate('reviewedBy', 'username')
      .sort({ createdAt: -1 })
      .lean();
    
    res.json(requests);
  } catch (error) {
    console.error('Error fetching card fund requests:', error);
    res.status(500).json({ error: 'Failed to fetch fund requests' });
  }
});

// GET /api/card-fund-requests/:id - Get single fund request
router.get('/:id', requireAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid request ID' });
    }
    
    const request = await CardFundRequest.findById(req.params.id)
      .populate('card', 'name last4digits balance')
      .populate('requestedBy', 'username')
      .populate('reviewedBy', 'username')
      .lean();
    
    if (!request) {
      return res.status(404).json({ error: 'Fund request not found' });
    }
    
    res.json(request);
  } catch (error) {
    console.error('Error fetching fund request:', error);
    res.status(500).json({ error: 'Failed to fetch fund request' });
  }
});

// POST /api/card-fund-requests - Create new fund request
router.post('/', requireAuth, requirePageAccess('CardFundRequests'), async (req, res) => {
  try {
    const { card, requestedAmount, remarks } = req.body;
    
    if (!card || !requestedAmount) {
      return res.status(400).json({ error: 'Card and requested amount are required' });
    }
    
    if (!mongoose.Types.ObjectId.isValid(card)) {
      return res.status(400).json({ error: 'Invalid card ID' });
    }
    
    const amount = parseFloat(requestedAmount);
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Requested amount must be a positive number' });
    }
    
    // Verify card exists
    const cardExists = await CreditCard.findById(card);
    if (!cardExists) {
      return res.status(404).json({ error: 'Card not found' });
    }
    
    const fundRequest = new CardFundRequest({
      card,
      requestedAmount: amount,
      requestedBy: req.user.userId,
      remarks: remarks || '',
      status: 'PENDING'
    });
    
    await fundRequest.save();
    await fundRequest.populate('card', 'name last4digits balance');
    await fundRequest.populate('requestedBy', 'username');
    
    res.status(201).json(fundRequest);
  } catch (error) {
    console.error('Error creating fund request:', error);
    res.status(500).json({ error: 'Failed to create fund request' });
  }
});

// PUT /api/card-fund-requests/:id/approve - Approve fund request (SuperAdmin only)
router.put('/:id/approve', requireAuth, requirePageAccess('SuperAdmin'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid request ID' });
    }
    
    const fundRequest = await CardFundRequest.findById(req.params.id);
    if (!fundRequest) {
      return res.status(404).json({ error: 'Fund request not found' });
    }
    
    if (fundRequest.status !== 'PENDING') {
      return res.status(400).json({ error: `Request is already ${fundRequest.status.toLowerCase()}` });
    }
    
    // Update card balance
    const card = await CreditCard.findById(fundRequest.card);
    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }
    
    card.balance = (card.balance || 0) + fundRequest.requestedAmount;
    await card.save();
    
    // Update request status
    fundRequest.status = 'APPROVED';
    fundRequest.reviewedBy = req.user.userId;
    fundRequest.reviewDate = new Date();
    await fundRequest.save();
    
    await fundRequest.populate('card', 'name last4digits balance');
    await fundRequest.populate('requestedBy', 'username');
    await fundRequest.populate('reviewedBy', 'username');
    
    res.json({
      message: 'Fund request approved successfully',
      fundRequest,
      newCardBalance: card.balance
    });
  } catch (error) {
    console.error('Error approving fund request:', error);
    res.status(500).json({ error: 'Failed to approve fund request' });
  }
});

// PUT /api/card-fund-requests/:id/reject - Reject fund request (SuperAdmin only)
router.put('/:id/reject', requireAuth, requirePageAccess('SuperAdmin'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid request ID' });
    }
    
    const { rejectionReason } = req.body;
    
    const fundRequest = await CardFundRequest.findById(req.params.id);
    if (!fundRequest) {
      return res.status(404).json({ error: 'Fund request not found' });
    }
    
    if (fundRequest.status !== 'PENDING') {
      return res.status(400).json({ error: `Request is already ${fundRequest.status.toLowerCase()}` });
    }
    
    fundRequest.status = 'REJECTED';
    fundRequest.reviewedBy = req.user.userId;
    fundRequest.reviewDate = new Date();
    fundRequest.rejectionReason = rejectionReason || 'No reason provided';
    await fundRequest.save();
    
    await fundRequest.populate('card', 'name last4digits balance');
    await fundRequest.populate('requestedBy', 'username');
    await fundRequest.populate('reviewedBy', 'username');
    
    res.json({
      message: 'Fund request rejected',
      fundRequest
    });
  } catch (error) {
    console.error('Error rejecting fund request:', error);
    res.status(500).json({ error: 'Failed to reject fund request' });
  }
});

// DELETE /api/card-fund-requests/:id - Delete fund request (only if PENDING)
router.delete('/:id', requireAuth, requirePageAccess('CardFundRequests'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid request ID' });
    }
    
    const fundRequest = await CardFundRequest.findById(req.params.id);
    if (!fundRequest) {
      return res.status(404).json({ error: 'Fund request not found' });
    }
    
    if (fundRequest.status !== 'PENDING') {
      return res.status(400).json({ error: 'Can only delete pending requests' });
    }
    
    await CardFundRequest.findByIdAndDelete(req.params.id);
    
    res.json({ message: 'Fund request deleted successfully' });
  } catch (error) {
    console.error('Error deleting fund request:', error);
    res.status(500).json({ error: 'Failed to delete fund request' });
  }
});

export default router;
