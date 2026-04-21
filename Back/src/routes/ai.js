

import express from 'express';
import OpenAI from 'openai';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import AiFitmentUsage from '../models/AiFitmentUsage.js';
import User from '../models/User.js';

const router = express.Router();

// Lazy singleton — instantiated on first request so dotenv has already run
let _openai = null;
function getOpenAI() {
    if (!_openai) {
        // Use a dedicated key for fitment AI if configured, else fall back to the default
        const apiKey = process.env.OPENAI_FITMENT_API_KEY;
        _openai = new OpenAI({ apiKey });
    }
    return _openai;
}

// ============================================
// AI SUGGEST FITMENT
// POST /api/ai/suggest-fitment
// Body: { title: string, description: string }
// Returns: { make, model, startYear, endYear, allFitments }
// ============================================
router.post('/suggest-fitment', requireAuth, async (req, res) => {
    try {
        const { title = '', description = '' } = req.body;

        if (!title && !description) {
            return res.status(400).json({ error: 'title or description is required' });
        }

        // Strip HTML tags, then cut at boilerplate phrases that appear mid-description
        // (shipping promos, seller banners, store links — all irrelevant for fitment)
        const BOILERPLATE_SIGNALS = [
            'Top Seller', 'Fast, Reliable Shipping', 'Always Free', '1-Day Processing',
            'Questions?', "We're Happy to Help", 'Buy with Confidence',
            'Ship from USA', 'Free & Fast Shipping', '30 Days Return',
            'PLEASE VISIT OUR STORE', 'Thank you for shopping',
            'All communication is handled', 'eBay\'s messaging platform',
            'Orders ship within', 'carefully inspected before shipping',
        ];
        let rawText = description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        // Find the earliest boilerplate cut point
        let cutAt = rawText.length;
        for (const signal of BOILERPLATE_SIGNALS) {
            const idx = rawText.indexOf(signal);
            if (idx !== -1 && idx < cutAt) cutAt = idx;
        }
        const cleanDescription = rawText.slice(0, cutAt).trim().slice(0, 500);

        const prompt = `You are an automotive parts expert. Extract all vehicle fitments from this eBay listing.

IMPORTANT: Focus PRIMARILY on the Description for extracting fitment data. The Title may contain SEO keywords that are not actual fitment info. Use the Title only as supplementary context when the Description lacks detail.

Description: ${cleanDescription}
Title: ${title}

Return ONLY a valid JSON array (no markdown, no explanation) where each object has:
- "make": string (e.g. "Toyota")
- "model": string (e.g. "Camry")
- "startYear": string or null (e.g. "2010")
- "endYear": string or null (same as startYear if only one year)

Rules:
- If a year range is EXPLICITLY stated like "2008-2013", use startYear="2008" endYear="2013"
- If a single year is EXPLICITLY stated like "2005", use startYear="2005" endYear="2005"
- CRITICAL: If NO year is explicitly mentioned in the description or title for a fitment, you MUST set startYear and endYear to null. Do NOT guess, infer, or assume years based on the vehicle generation or your knowledge.
- Only include make and model entries where you are confident based on the text
- Do not invent or assume any data not explicitly present in the description or title
- Use the most specific model name mentioned (e.g. "F-150" not just "F-Series")
- If the description lists a compatibility/fitment table, extract all entries from it

Example output: [{"make":"Lexus","model":"IS F","startYear":"2008","endYear":"2013"},{"make":"Toyota","model":"Camry","startYear":null,"endYear":null}]`;

        const completion = await getOpenAI().chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0,
            max_tokens: 500
        });

        const raw = completion.choices[0]?.message?.content?.trim() || '[]';

        let allFitments = [];
        try {
            // Strip any accidental markdown code fences
            const cleaned = raw.replace(/^```[a-z]*\n?/i, '').replace(/```$/i, '').trim();
            allFitments = JSON.parse(cleaned);
            if (!Array.isArray(allFitments)) allFitments = [];
        } catch (parseErr) {
            console.error('[AI Suggest Fitment] Failed to parse OpenAI response:', raw);
            return res.status(500).json({ error: 'AI returned unexpected format', raw });
        }

        // Track AI usage
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10);
        AiFitmentUsage.create({
            userId: req.user.userId,
            action: 'ai_suggest',
            itemCount: 1,
            hadData: allFitments.length > 0,
            date: dateStr,
            year: now.getFullYear(),
            month: now.getMonth() + 1,
            day: now.getDate()
        }).catch(err => console.error('[AI Usage Track] Error:', err.message));

        if (allFitments.length === 0) {
            return res.json({ make: null, model: null, startYear: null, endYear: null, allFitments: [] });
        }

        // Pick the fitment with the longest year gap
        const best = allFitments.reduce((prev, curr) => {
            const prevGap = Number(prev.endYear) - Number(prev.startYear);
            const currGap = Number(curr.endYear) - Number(curr.startYear);
            return currGap > prevGap ? curr : prev;
        });

        res.json({
            make: best.make,
            model: best.model,
            startYear: best.startYear,
            endYear: best.endYear,
            allFitments
        });

    } catch (error) {
        console.error('[AI Suggest Fitment] Error:', error.message);
        res.status(500).json({ error: 'AI request failed', details: error.message });
    }
});

// ============================================
// TRACK SAVE & NEXT ACTION
// POST /api/ai/track-save-next
// Body: { hadData: boolean }
// ============================================
router.post('/track-save-next', requireAuth, async (req, res) => {
    try {
        const { hadData = false } = req.body;
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10);
        await AiFitmentUsage.create({
            userId: req.user.userId,
            action: 'save_next',
            itemCount: 1,
            hadData,
            date: dateStr,
            year: now.getFullYear(),
            month: now.getMonth() + 1,
            day: now.getDate()
        });
        res.json({ ok: true });
    } catch (error) {
        console.error('[Track Save Next] Error:', error.message);
        res.status(500).json({ error: 'Failed to track action' });
    }
});

// ============================================
// REPHRASE TITLE
// POST /api/ai/rephrase-title
// Body: { currentTitle, sourceTitle, brand, color, compatibility }
// Returns: { rephrasedTitle }
// ============================================
router.post('/rephrase-title', requireAuth, async (req, res) => {
    try {
        const { currentTitle = '', sourceTitle = '', brand = '', color = '', compatibility = '' } = req.body;

        if (!currentTitle) {
            return res.status(400).json({ error: 'currentTitle is required' });
        }

        const prompt = `You are an eBay listing SEO expert.
Rephrase the following eBay product title. The rephrased title must:
- Convey the same product and key attributes
- Use different word order or synonyms compared to the original
- Be strictly under 80 characters
- Contain no markdown, quotes, or extra commentary — return only the plain title text

Amazon product title (context only): ${sourceTitle}
Brand: ${brand}
Color: ${color}
Compatibility: ${compatibility}

eBay title to rephrase: ${currentTitle}`;

        const completion = await getOpenAI().chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model: 'gpt-4o-mini',
            temperature: 0.7,
            max_tokens: 60,
        });

        let rephrasedTitle = completion.choices[0]?.message?.content?.trim() || '';
        // Strip any surrounding quotes the model may add
        rephrasedTitle = rephrasedTitle.replace(/^["']|["']$/g, '').trim();
        // Hard safety truncation to 80 chars
        if (rephrasedTitle.length > 80) {
            rephrasedTitle = rephrasedTitle.substring(0, 80);
        }

        res.json({ rephrasedTitle });
    } catch (error) {
        console.error('[AI Rephrase Title] Error:', error.message);
        res.status(500).json({ error: 'AI request failed', details: error.message });
    }
});

// ============================================
// AI FITMENT USAGE STATS
// GET /api/ai/fitment-usage-stats?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// Returns day-wise, user-wise stats
// ============================================
router.get('/fitment-usage-stats', requireAuth, requirePageAccess('AiFitmentUsage'), async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const matchStage = {};
        if (startDate) matchStage.date = { $gte: startDate };
        if (endDate) matchStage.date = { ...matchStage.date, $lte: endDate };

        const stats = await AiFitmentUsage.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: { userId: '$userId', date: '$date', action: '$action' },
                    totalCount: { $sum: '$itemCount' },
                    withDataCount: { $sum: { $cond: ['$hadData', '$itemCount', 0] } }
                }
            },
            {
                $group: {
                    _id: { userId: '$_id.userId', date: '$_id.date' },
                    actions: {
                        $push: {
                            action: '$_id.action',
                            totalCount: '$totalCount',
                            withDataCount: '$withDataCount'
                        }
                    }
                }
            },
            { $sort: { '_id.date': -1 } }
        ]);

        // Collect unique user IDs and fetch names
        const userIds = [...new Set(stats.map(s => s._id.userId.toString()))];
        const users = await User.find(
            { _id: { $in: userIds } },
            { username: 1, name: 1, role: 1 }
        ).lean();
        const userMap = {};
        users.forEach(u => { userMap[u._id.toString()] = { username: u.username, name: u.name, role: u.role }; });

        // Reshape into a friendly format
        const result = stats.map(s => {
            const uid = s._id.userId.toString();
            const row = {
                userId: uid,
                username: userMap[uid]?.username || 'Unknown',
                name: userMap[uid]?.name || '',
                role: userMap[uid]?.role || '',
                date: s._id.date,
                aiSuggestCount: 0,
                saveNextCount: 0,
                saveNextWithDataCount: 0
            };
            s.actions.forEach(a => {
                if (a.action === 'ai_suggest') row.aiSuggestCount = a.totalCount;
                if (a.action === 'save_next') {
                    row.saveNextCount = a.totalCount;
                    row.saveNextWithDataCount = a.withDataCount;
                }
            });
            return row;
        });

        res.json(result);
    } catch (error) {
        console.error('[AI Fitment Usage Stats] Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch usage stats' });
    }
});

export default router;
