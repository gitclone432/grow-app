import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import PayoneerRecord from '../models/PayoneerRecord.js';
import GmailProcessedPayoneerMail from '../models/GmailProcessedPayoneerMail.js';
import {
    getConfiguredAllowedSenders,
    getConfiguredAllowedSubjects,
    senderAllowed,
    subjectAllowed,
} from './gmailTransactionImporter.js';

const PAYOUT_ID_REGEX = /(?:payout\s*id|payoutid)\s*[:#-]?\s*([A-Za-z0-9-]{6,})/i;
const EXCHANGE_RATE_REGEX = /(?:exchange\s*rate|fx\s*rate|rate)\s*[:=]?\s*([0-9][0-9,]*(?:\.\d+)?)/i;
const BANK_DEPOSIT_REGEX = /(?:bank\s*deposit|deposit(?:ed)?\s*amount|credited\s*amount)\D{0,20}(?:inr|₹|rs\.?)?\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i;

function normalizeNumber(raw) {
    const n = Number(String(raw || '').replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : null;
}

function parseMailForPayoneer({ subject = '', text = '' }) {
    const combined = `${subject}\n${text}`;
    const payoutMatch = combined.match(PAYOUT_ID_REGEX);
    const exchangeMatch = combined.match(EXCHANGE_RATE_REGEX);
    const depositMatch = combined.match(BANK_DEPOSIT_REGEX);

    return {
        payoutId: payoutMatch?.[1]?.trim() || '',
        exchangeRate: exchangeMatch ? normalizeNumber(exchangeMatch[1]) : null,
        bankDeposit: depositMatch ? normalizeNumber(depositMatch[1]) : null
    };
}

export async function importPayoneerFieldsFromGmail({ limit = 50 } = {}) {
    const host = String(process.env.GMAIL_IMAP_HOST || 'imap.gmail.com').trim();
    const port = Number(process.env.GMAIL_IMAP_PORT || 993);
    const secure = String(process.env.GMAIL_IMAP_SECURE || 'true').toLowerCase() !== 'false';
    const user = String(process.env.GMAIL_IMAP_USER || '').trim();
    const pass = String(process.env.GMAIL_IMAP_APP_PASSWORD || '').trim();

    if (!user || !pass) {
        throw new Error('GMAIL_IMAP_USER and GMAIL_IMAP_APP_PASSWORD are required.');
    }

    const allowedSenders = getConfiguredAllowedSenders();
    const allowedSubjects = getConfiguredAllowedSubjects();
    const client = new ImapFlow({ host, port, secure, auth: { user, pass } });
    const report = {
        scanned: 0,
        matched: 0,
        updated: 0,
        skipped: 0,
        errors: []
    };

    await client.connect();
    try {
        await client.mailboxOpen('INBOX');
        let fetched = 0;
        for await (const msg of client.fetch({ seen: false }, { envelope: true, source: true, uid: true })) {
            if (fetched >= limit) break;
            fetched += 1;
            report.scanned += 1;

            const messageId = msg.envelope?.messageId || `${msg.uid}`;
            const subject = msg.envelope?.subject || '';
            const fromText = (msg.envelope?.from || [])
                .map((f) => `${f.name || ''} <${f.address || ''}>`.trim())
                .join(', ');

            const resolvedSubject = subject || '';

            if (!senderAllowed(fromText, allowedSenders)) {
                report.skipped += 1;
                continue;
            }
            if (!subjectAllowed(resolvedSubject, allowedSubjects)) {
                report.skipped += 1;
                continue;
            }

            const already = await GmailProcessedPayoneerMail.findOne({ messageId }).select('_id').lean();
            if (already) {
                report.skipped += 1;
                continue;
            }

            const parsed = await simpleParser(msg.source);
            const extracted = parseMailForPayoneer({
                subject: subject || parsed.subject || '',
                text: parsed.text || parsed.html || ''
            });

            if (!extracted.payoutId || (extracted.exchangeRate === null && extracted.bankDeposit === null)) {
                report.skipped += 1;
                continue;
            }

            const rec = await PayoneerRecord.findOne({ ebayPayoutId: extracted.payoutId });
            if (!rec) {
                report.skipped += 1;
                continue;
            }

            report.matched += 1;

            if (extracted.exchangeRate !== null) rec.exchangeRate = extracted.exchangeRate;
            if (extracted.bankDeposit !== null) rec.bankDeposit = extracted.bankDeposit;

            if (extracted.exchangeRate !== null) {
                rec.actualExchangeRate = Number((extracted.exchangeRate * 1.02).toFixed(4));
            }
            if (extracted.bankDeposit === null && extracted.exchangeRate !== null) {
                rec.bankDeposit = Number((Number(rec.amount || 0) * extracted.exchangeRate).toFixed(2));
            }

            await rec.save();
            report.updated += 1;

            await GmailProcessedPayoneerMail.create({
                messageId,
                from: fromText,
                subject,
                payoutId: extracted.payoutId,
                exchangeRate: extracted.exchangeRate ?? undefined,
                bankDeposit: extracted.bankDeposit ?? undefined,
                payoneerRecordId: rec._id
            });
        }
    } catch (err) {
        report.errors.push(err.message);
    } finally {
        await client.logout();
    }

    return report;
}

