import express from 'express';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import {
  getGmailImportStatus,
  importTransactionsFromGmail,
  previewTransactionsFromGmail,
} from '../utils/gmailTransactionImporter.js';

const router = express.Router();

router.get('/status', requireAuth, requirePageAccess('GmailTester'), async (req, res) => {
  try {
    const status = await getGmailImportStatus();
    res.json(status);
  } catch (err) {
    console.error('[GmailTester] status:', err);
    res.status(500).json({ error: err.message || 'Failed to load Gmail status' });
  }
});

router.post('/preview', requireAuth, requirePageAccess('GmailTester'), async (req, res) => {
  try {
    const modeRaw = String(req.body?.mode || 'all').trim().toLowerCase();
    const mode = modeRaw === 'unread' || modeRaw === 'recent' ? modeRaw : 'all';
    const defaultLimit = mode === 'unread' ? 25 : 500;
    const limit = Math.max(1, Math.min(2000, Number(req.body?.limit) || defaultLimit));
    const report = await previewTransactionsFromGmail({ limit, mode });
    res.json(report);
  } catch (err) {
    console.error('[GmailTester] preview:', err);
    res.status(500).json({ error: err.message || 'Gmail preview failed' });
  }
});

router.post('/import', requireAuth, requirePageAccess('GmailTester'), async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(100, Number(req.body?.limit) || 25));
    const report = await importTransactionsFromGmail({ limit });
    res.json(report);
  } catch (err) {
    console.error('[GmailTester] import:', err);
    res.status(500).json({ error: err.message || 'Gmail import failed' });
  }
});

export default router;
