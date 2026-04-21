import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import User from '../models/User.js';
import UserSellerAssignment from '../models/UserSellerAssignment.js';
import { validate } from '../utils/validate.js';
import { loginSchema } from '../schemas/index.js';

const router = Router();

// Rate limit login attempts: max 15 requests per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again after 15 minutes.' }
});

router.post('/login', loginLimiter, validate(loginSchema), async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  const user = await User.findOne({ username });
  if (!user) return res.status(404).json({ error: 'Username not found' });
  if (!user.active) return res.status(401).json({ error: 'Account is not active' });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Incorrect password' });
  const token = jwt.sign({ 
    userId: user._id.toString(), 
    role: user.role, 
    tokenVersion: user.tokenVersion || 1,
    permissionsVersion: user.permissionsVersion || 1
  }, process.env.JWT_SECRET, { expiresIn: '7d' });

  // Fetch assigned sellers for this user
  const sellerAssignments = await UserSellerAssignment.find({ user: user._id }).select('seller').lean();
  const assignedSellers = sellerAssignments.map(a => a.seller.toString());

  res.json({
    token,
    user: {
      id: user._id,
      email: user.email,
      username: user.username,
      role: user.role,
      pagePermissions: user.pagePermissions || [],
      useCustomPermissions: user.useCustomPermissions || false,
      assignedSellers
    }
  });
});

// Seed superadmin if none exists (development helper — disabled in production)
router.post('/seed-superadmin', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }
  const { email, username, password } = req.body || {};
  if (!email || !username || !password) return res.status(400).json({ error: 'email, username, password required' });
  const exists = await User.findOne({ role: 'superadmin' });
  if (exists) return res.status(400).json({ error: 'Superadmin already exists' });
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ email, username, passwordHash, role: 'superadmin' });
  res.json({ id: user._id });
});

export default router;
