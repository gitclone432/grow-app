// routes/amazonAccounts.js
import { Router } from 'express';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import { validate } from '../utils/validate.js';
import { createAmazonAccountSchema } from '../schemas/index.js';
import AmazonAccount from '../models/AmazonAccount.js';

const router = Router();

// GET: Fetch all Amazon Accounts (Accessible by authenticated users so Dashboard can read it)
router.get('/', requireAuth, async (req, res) => {
  try {
    const accounts = await AmazonAccount.find().sort({ name: 1 });
    res.json(accounts);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST: Add new Amazon Account (Restricted to specific roles)
router.post('/', requireAuth, requirePageAccess('AmazonAccounts'), validate(createAmazonAccountSchema), async (req, res) => {
  const { name, addressLine1, addressLine2, city, state, postalCode, country, phoneNumber, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Account name is required' });
  
  try {
    const account = await AmazonAccount.create({ 
      name, 
      addressLine1: addressLine1 || '', 
      addressLine2: addressLine2 || '', 
      city: city || '', 
      state: state || '', 
      postalCode: postalCode || '', 
      country: country || '', 
      phoneNumber: phoneNumber || '', 
      notes: notes || '' 
    });
    res.json(account);
  } catch (e) {
    if (e.code === 11000) {
      return res.status(400).json({ error: 'Account name already exists' });
    }
    res.status(400).json({ error: e.message });
  }
});

// PATCH: Update an account
router.patch('/:id', requireAuth, requirePageAccess('AmazonAccounts'), async (req, res) => {
  const { name, addressLine1, addressLine2, city, state, postalCode, country, phoneNumber, notes } = req.body;
  
  try {
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (addressLine1 !== undefined) updateData.addressLine1 = addressLine1;
    if (addressLine2 !== undefined) updateData.addressLine2 = addressLine2;
    if (city !== undefined) updateData.city = city;
    if (state !== undefined) updateData.state = state;
    if (postalCode !== undefined) updateData.postalCode = postalCode;
    if (country !== undefined) updateData.country = country;
    if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
    if (notes !== undefined) updateData.notes = notes;

    const account = await AmazonAccount.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    res.json(account);
  } catch (e) {
    if (e.code === 11000) {
      return res.status(400).json({ error: 'Account name already exists' });
    }
    res.status(400).json({ error: e.message });
  }
});

// DELETE: Remove an account (Optional, but good to have)
router.delete('/:id', requireAuth, requirePageAccess('AmazonAccounts'), async (req, res) => {
    try {
      await AmazonAccount.findByIdAndDelete(req.params.id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

export default router;