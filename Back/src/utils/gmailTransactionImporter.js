import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import mongoose from 'mongoose';
import BankAccount from '../models/BankAccount.js';
import Transaction from '../models/Transaction.js';
import GmailProcessedMail from '../models/GmailProcessedMail.js';

const DATE_REGEX = /\b(\d{4}-\d{2}-\d{2}|\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\b/;
const AMOUNT_REGEX = /(?:amount|amt|credited|credit)\D{0,20}(?:inr|rs\.?|₹)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i;

function normalizeAmount(raw) {
    const cleaned = String(raw || '').replace(/,/g, '').trim();
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
}

function parseDateFromText(text, fallbackDate = null) {
    const m = String(text || '').match(DATE_REGEX);
    if (!m) return fallbackDate;
    const token = m[1];
    let d = new Date(token);
    if (!Number.isNaN(d.getTime())) return d;

    const parts = token.split(/[/-]/).map((p) => p.trim());
    if (parts.length === 3) {
        const [a, b, c] = parts;
        const year = c.length === 2 ? `20${c}` : c;
        d = new Date(`${year}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`);
        if (!Number.isNaN(d.getTime())) return d;
    }
    return fallbackDate;
}

function parseFieldsFromMail({ subject = '', text = '', date = null }) {
    const combined = `${subject}\n${text}`;
    const amountMatch = combined.match(AMOUNT_REGEX);
    const amount = amountMatch ? normalizeAmount(amountMatch[1]) : null;
    const parsedDate = parseDateFromText(combined, date || new Date());
    return { amount, date: parsedDate };
}

function getConfiguredAllowedSenders() {
    const raw = String(process.env.GMAIL_IMPORT_ALLOWED_SENDERS || '');
    return raw
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
}

function senderAllowed(fromText, allowedSenders) {
    if (!allowedSenders.length) return true;
    const from = String(fromText || '').toLowerCase();
    return allowedSenders.some((s) => from.includes(s));
}

function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function resolveBankAccount() {
    const id = String(process.env.GMAIL_IMPORT_BANK_ACCOUNT_ID || '').trim();
    if (id && mongoose.isValidObjectId(id)) {
        const byId = await BankAccount.findById(id).select('_id name').lean();
        if (byId) return byId;
    }

    const preferredName = String(process.env.GMAIL_IMPORT_BANK_ACCOUNT_NAME || '').trim().toLowerCase();
    if (preferredName) {
        const matches = await BankAccount.find({
            name: { $regex: new RegExp(`^${escapeRegex(preferredName)}$`, 'i') },
        })
            .sort({ createdAt: 1 })
            .select('_id name')
            .lean();
        if (matches.length > 0) return matches[0];
    }

    const first = await BankAccount.findOne({}).sort({ createdAt: 1 }).select('_id name').lean();
    return first || null;
}

export async function importTransactionsFromGmail({ limit = 25 } = {}) {
    const host = String(process.env.GMAIL_IMAP_HOST || 'imap.gmail.com').trim();
    const port = Number(process.env.GMAIL_IMAP_PORT || 993);
    const secure = String(process.env.GMAIL_IMAP_SECURE || 'true').toLowerCase() !== 'false';
    const user = String(process.env.GMAIL_IMAP_USER || '').trim();
    const pass = String(process.env.GMAIL_IMAP_APP_PASSWORD || '').trim();

    if (!user || !pass) {
        throw new Error('GMAIL_IMAP_USER and GMAIL_IMAP_APP_PASSWORD are required.');
    }

    const bankAccount = await resolveBankAccount();
    if (!bankAccount?._id) {
        throw new Error(
            'No bank account found. Create one first, or set GMAIL_IMPORT_BANK_ACCOUNT_ID (preferred if names duplicate) or GMAIL_IMPORT_BANK_ACCOUNT_NAME.'
        );
    }

    const allowedSenders = getConfiguredAllowedSenders();
    const client = new ImapFlow({ host, port, secure, auth: { user, pass } });

    const result = {
        scanned: 0,
        imported: 0,
        skipped: 0,
        errors: [],
        bankAccount: bankAccount.name
    };

    await client.connect();
    try {
        await client.mailboxOpen('INBOX');
        const search = { seen: false };
        let fetched = 0;
        for await (const msg of client.fetch(search, { envelope: true, source: true, uid: true, internalDate: true })) {
            if (fetched >= limit) break;
            fetched += 1;
            result.scanned += 1;

            const messageId = msg.envelope?.messageId || `${msg.uid}`;
            const subject = msg.envelope?.subject || '';
            const fromText = (msg.envelope?.from || [])
                .map((f) => `${f.name || ''} <${f.address || ''}>`.trim())
                .join(', ');

            if (!senderAllowed(fromText, allowedSenders)) {
                result.skipped += 1;
                continue;
            }

            const existing = await GmailProcessedMail.findOne({ messageId }).select('_id').lean();
            if (existing) {
                result.skipped += 1;
                continue;
            }

            const parsed = await simpleParser(msg.source);
            const fields = parseFieldsFromMail({
                subject: subject || parsed.subject || '',
                text: parsed.text || parsed.html || '',
                date: parsed.date || msg.internalDate || new Date()
            });

            if (!fields.amount || !fields.date) {
                result.skipped += 1;
                continue;
            }

            try {
                const transaction = await Transaction.create({
                    date: fields.date,
                    bankAccount: bankAccount._id,
                    transactionType: 'Credit',
                    amount: fields.amount,
                    remark: `Gmail import: ${subject}`.slice(0, 280),
                    source: 'MANUAL'
                });

                await GmailProcessedMail.create({
                    messageId,
                    from: fromText,
                    subject,
                    parsedDate: fields.date,
                    parsedAmount: fields.amount,
                    parsedBankAccountName: bankAccount.name,
                    transactionId: transaction._id
                });
                result.imported += 1;
            } catch (e) {
                result.errors.push(`UID ${msg.uid}: ${e.message}`);
            }
        }
    } finally {
        await client.logout();
    }

    return result;
}

