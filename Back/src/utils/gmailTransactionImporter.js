import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import mongoose from 'mongoose';
import BankAccount from '../models/BankAccount.js';
import Transaction from '../models/Transaction.js';
import GmailProcessedMail from '../models/GmailProcessedMail.js';

const DATE_REGEX = /\b(\d{4}-\d{2}-\d{2}|\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\b/;
const AMOUNT_REGEX = /(?:amount|amt|credited|credit)\D{0,20}(?:inr|rs\.?|₹)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i;
const PAYONEER_DEPOSIT_REGEX =
  /(?:amount\s+to\s+deposit|deposited\s+to\s+your\s+bank|bank\s+deposit)\D{0,30}(?:inr|rs\.?|₹)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i;
const PAYONEER_WITHDRAWAL_REGEX =
  /(?:withdrawal\s+amount|amount\s+to\s+withdraw|withdrew)\D{0,30}(?:usd|us\$|\$)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i;
/** Payoneer "Automatic withdrawal" table: Amount | $167.01 (not "Amount transferred…") */
const PAYONEER_AMOUNT_USD_REGEX =
  /\bAmount\b(?!\s+transferred)\D{0,20}\$?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i;
const PAYONEER_EXCHANGE_RATE_REGEX =
  /Exchange\s+Rate\D{0,12}1\s*USD\s*=\s*([0-9][0-9,]*(?:\.[0-9]{1,6})?)\s*INR/i;
const PAYONEER_BANK_TRANSFER_REGEX =
  /Amount\s+transferred\s+to\s+bank\s+account\D{0,20}([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*INR/i;
const PAYONEER_CUSTOMER_ID_REGEX = /(?:Your\s+)?Customer\s+ID\s+is\s*([0-9]+)/i;
const PAYONEER_GREETING_REGEX = /Dear\s+([^,\n<]+?)\s*,/i;

function extractFromPayoneerHtml(html) {
  const h = String(html || '');
  if (!h) return {};
  const cellValue = (labelPattern) => {
    const re = new RegExp(
      `<td[^>]*>\\s*${labelPattern}\\s*</td>\\s*<td[^>]*>\\s*([^<]+)`,
      'i'
    );
    const m = h.match(re);
    return m ? m[1].replace(/&nbsp;/g, ' ').trim() : null;
  };
  const amountUsdRaw = cellValue('Amount(?!\\s+transferred)');
  const rateRaw = cellValue('Exchange\\s+Rate');
  const depositRaw = cellValue('Amount\\s+transferred\\s+to\\s+bank\\s+account');
  let exchangeRate = null;
  const rateMatch = String(rateRaw || h).match(/1\s*USD\s*=\s*([0-9][0-9,]*(?:\.[0-9]{1,6})?)\s*INR/i);
  if (rateMatch) exchangeRate = normalizeAmount(rateMatch[1]);
  const amountUsd = amountUsdRaw ? normalizeAmount(amountUsdRaw.replace(/^\$/, '')) : null;
  const bankDepositInr = depositRaw
    ? normalizeAmount(String(depositRaw).replace(/\s*INR\s*$/i, ''))
    : null;
  return { amountUsd, exchangeRate, bankDepositInr };
}


function stripHtml(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

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

function normalizeSubjectLine(subject) {
  return String(subject || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function parseFieldsFromMail({ subject = '', text = '', html = '', date = null }) {
  const plainHtml = stripHtml(html);
  const combined = `${subject}\n${text}\n${plainHtml}`;

  const htmlFields = extractFromPayoneerHtml(html);

  const amountUsdMatch = combined.match(PAYONEER_AMOUNT_USD_REGEX);
  const exchangeMatch = combined.match(PAYONEER_EXCHANGE_RATE_REGEX);
  const bankTransferMatch = combined.match(PAYONEER_BANK_TRANSFER_REGEX);
  const customerIdMatch = combined.match(PAYONEER_CUSTOMER_ID_REGEX);
  const greetingMatch = combined.match(PAYONEER_GREETING_REGEX);

  const amountUsd =
    (amountUsdMatch ? normalizeAmount(amountUsdMatch[1]) : null) ?? htmlFields.amountUsd;
  const exchangeRate =
    (exchangeMatch ? normalizeAmount(exchangeMatch[1]) : null) ?? htmlFields.exchangeRate;
  const bankDepositInr =
    (bankTransferMatch ? normalizeAmount(bankTransferMatch[1]) : null) ?? htmlFields.bankDepositInr;
  const customerId = customerIdMatch?.[1]?.trim() || '';
  const greetingName = greetingMatch?.[1]?.replace(/\s+/g, ' ').trim() || '';
  const greetingLine = greetingName ? `Dear ${greetingName},` : '';

  const depositMatch = combined.match(PAYONEER_DEPOSIT_REGEX);
  const withdrawalMatch = combined.match(PAYONEER_WITHDRAWAL_REGEX);
  const genericMatch = combined.match(AMOUNT_REGEX);
  const legacyAmountRaw = depositMatch?.[1] || withdrawalMatch?.[1] || genericMatch?.[1];
  const legacyAmount = legacyAmountRaw ? normalizeAmount(legacyAmountRaw) : null;

  /** Credit on Transactions = INR deposited to bank when present. */
  const amount = bankDepositInr ?? legacyAmount;
  const parsedDate = parseDateFromText(combined, date || new Date());

  return {
    amountUsd,
    exchangeRate,
    bankDepositInr,
    customerId,
    greetingName,
    greetingLine,
    amount,
    date: parsedDate,
  };
}

export function getConfiguredAllowedSenders() {
  const raw = String(process.env.GMAIL_IMPORT_ALLOWED_SENDERS || '');
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getConfiguredAllowedSubjects() {
  const raw = String(process.env.GMAIL_IMPORT_ALLOWED_SUBJECTS || '');
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function senderAllowed(fromText, allowedSenders) {
  if (!allowedSenders.length) return true;
  const from = String(fromText || '').toLowerCase();
  return allowedSenders.some((s) => from.includes(s.toLowerCase()));
}

export function subjectAllowed(subject, allowedSubjects) {
  if (!allowedSubjects.length) return true;
  const normalized = normalizeSubjectLine(subject);
  return allowedSubjects.some((s) => normalizeSubjectLine(s) === normalized);
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getImapConfig() {
  const host = String(process.env.GMAIL_IMAP_HOST || 'imap.gmail.com').trim();
  const port = Number(process.env.GMAIL_IMAP_PORT || 993);
  const secure = String(process.env.GMAIL_IMAP_SECURE || 'true').toLowerCase() !== 'false';
  const user = String(process.env.GMAIL_IMAP_USER || '').trim();
  const pass = String(process.env.GMAIL_IMAP_APP_PASSWORD || '').trim();
  return { host, port, secure, user, pass };
}

function maskEmail(user) {
  const s = String(user || '').trim();
  if (!s.includes('@')) return s ? '***' : '';
  const [local, domain] = s.split('@');
  const head = local.slice(0, 2);
  return `${head}***@${domain}`;
}

export async function getGmailImportStatus() {
  const { user, pass, host, port, secure } = getImapConfig();
  return {
    imapConfigured: Boolean(user && pass),
    imapHost: host,
    imapPort: port,
    imapSecure: secure,
    imapUserMasked: maskEmail(user),
    allowedSenders: getConfiguredAllowedSenders(),
    allowedSubjects: getConfiguredAllowedSubjects(),
    cronEnabled: String(process.env.GMAIL_IMPORT_ENABLED || '').toLowerCase() === 'true',
    cronExpr: String(process.env.GMAIL_IMPORT_CRON || '*/5 * * * *').trim(),
    importLimit: Math.max(1, Math.min(100, Number(process.env.GMAIL_IMPORT_LIMIT || 25))),
  };
}

export async function resolveBankAccount() {
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

  const first = await BankAccount.findOne({}).sort({ createdAt: 1 }).select('_id name payoneerId').lean();
  return first || null;
}

async function loadBankAccountsByPayoneerId() {
  const rows = await BankAccount.find({ payoneerId: { $exists: true, $ne: '' } })
    .select('_id name payoneerId')
    .lean();
  const map = new Map();
  for (const row of rows) {
    const key = String(row.payoneerId || '').trim();
    if (key) map.set(key, row);
  }
  return map;
}

function resolveBankForCustomer(customerId, defaultBank, byPayoneerId) {
  const key = String(customerId || '').trim();
  if (key && byPayoneerId?.has(key)) return byPayoneerId.get(key);
  return defaultBank;
}

function classifyMessage({ fromText, subject, allowedSenders, allowedSubjects, alreadyProcessed, fields }) {
  if (!senderAllowed(fromText, allowedSenders)) {
    return { status: 'skipped', skipReason: 'Sender not in GMAIL_IMPORT_ALLOWED_SENDERS' };
  }
  if (!subjectAllowed(subject, allowedSubjects)) {
    return { status: 'skipped', skipReason: 'Subject does not match GMAIL_IMPORT_ALLOWED_SUBJECTS' };
  }
  if (alreadyProcessed) {
    return { status: 'skipped', skipReason: 'Already imported (in gmailprocessedmails)' };
  }
  if (!fields.amount && !fields.date) {
    return { status: 'skipped', skipReason: 'Could not parse amount and date' };
  }
  if (!fields.amount) {
    return { status: 'skipped', skipReason: 'Could not parse amount transferred to bank (INR)' };
  }
  if (!fields.date) {
    return { status: 'skipped', skipReason: 'Could not parse date' };
  }
  return { status: 'ready', skipReason: '' };
}

const PREVIEW_LIMIT_MAX = 2000;
const PREVIEW_LIMIT_DEFAULT = 500;

function normalizePreviewMode(mode) {
  if (mode === 'all' || mode === 'recent') return mode;
  return 'unread';
}

function escapeGmailRawTerm(s) {
  return String(s || '')
    .trim()
    .replace(/"/g, '\\"');
}

/** Gmail X-GM-RAW query from env sender/subject filters. */
function buildGmailRawQuery(allowedSenders, allowedSubjects, mode) {
  const parts = [];
  if (mode === 'unread') parts.push('is:unread');

  if (allowedSenders.length > 1) {
    parts.push(`(${allowedSenders.map((s) => `from:${escapeGmailRawTerm(s)}`).join(' OR ')})`);
  } else if (allowedSenders.length === 1) {
    parts.push(`from:${escapeGmailRawTerm(allowedSenders[0])}`);
  }

  if (allowedSubjects.length > 1) {
    parts.push(
      `(${allowedSubjects.map((s) => `subject:"${escapeGmailRawTerm(s)}"`).join(' OR ')})`
    );
  } else if (allowedSubjects.length === 1) {
    parts.push(`subject:"${escapeGmailRawTerm(allowedSubjects[0])}"`);
  }

  return parts.join(' ').trim();
}

function buildStandardImapSearch(allowedSenders, allowedSubjects, mode) {
  const criteria = {};
  if (mode === 'unread') criteria.seen = false;
  if (allowedSenders.length === 1) criteria.from = allowedSenders[0];
  if (allowedSubjects.length === 1) criteria.subject = allowedSubjects[0];
  return criteria;
}

function normalizeUidList(raw) {
  if (Array.isArray(raw)) return raw.map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (raw && Array.isArray(raw.all)) return raw.all.map(Number).filter((n) => Number.isFinite(n) && n > 0);
  return [];
}

/** IMAP SEARCH for env-configured Payoneer sender/subject before downloading bodies. */
async function searchFilteredMessageUids(client, { mode, limit, allowedSenders, allowedSubjects }) {
  const hasFilter = allowedSenders.length > 0 || allowedSubjects.length > 0;
  if (!hasFilter) return null;

  let uids = [];
  const gmraw = buildGmailRawQuery(allowedSenders, allowedSubjects, mode);

  try {
    if (gmraw) {
      uids = normalizeUidList(await client.search({ gmraw }, { uid: true }));
    }
  } catch {
    uids = [];
  }

  if (!uids.length) {
    const standard = buildStandardImapSearch(allowedSenders, allowedSubjects, mode);
    if (Object.keys(standard).length > (mode === 'unread' ? 1 : 0) || standard.from || standard.subject) {
      uids = normalizeUidList(await client.search(standard, { uid: true }));
    }
  }

  uids.sort((a, b) => b - a);
  const matchingInboxTotal = uids.length;
  const capped = uids.slice(0, Math.max(1, limit));

  return { uids: capped, matchingInboxTotal, imapFiltered: true };
}

async function processScannedMessage(msg, { allowedSenders, allowedSubjects, bankAccount, bankByPayoneerId }) {
  const messageId = msg.envelope?.messageId || `uid-${msg.uid}`;
  const subject = msg.envelope?.subject || '';
  const fromText = (msg.envelope?.from || [])
    .map((f) => `${f.name || ''} <${f.address || ''}>`.trim())
    .join(', ');

  const parsedMail = await simpleParser(msg.source);
  const bodyText = String(parsedMail.text || '').trim();
  const bodyHtml = String(parsedMail.html || '').trim();
  const fields = parseFieldsFromMail({
    subject: subject || parsedMail.subject || '',
    text: bodyText,
    html: bodyHtml,
    date: parsedMail.date || msg.internalDate || new Date(),
  });

  const existing = await GmailProcessedMail.findOne({ messageId })
    .select('_id transactionId parsedAmount parsedDate')
    .lean();

  const resolvedSubject = subject || parsedMail.subject || '';
  const importBank = resolveBankForCustomer(fields.customerId, bankAccount, bankByPayoneerId);
  const { status, skipReason } = classifyMessage({
    fromText,
    subject: resolvedSubject,
    allowedSenders,
    allowedSubjects,
    alreadyProcessed: Boolean(existing),
    fields,
  });

  return {
    uid: msg.uid,
    messageId,
    from: fromText,
    subject: resolvedSubject,
    internalDate: msg.internalDate ? new Date(msg.internalDate).toISOString() : null,
    seen: Boolean(msg.flags?.has('\\Seen')),
    senderAllowed: senderAllowed(fromText, allowedSenders),
    subjectAllowed: subjectAllowed(resolvedSubject, allowedSubjects),
    alreadyProcessed: Boolean(existing),
    existingTransactionId: existing?.transactionId ? String(existing.transactionId) : null,
    parsedAmountUsd: fields.amountUsd,
    parsedExchangeRate: fields.exchangeRate,
    parsedBankDepositInr: fields.bankDepositInr,
    parsedCustomerId: fields.customerId || null,
    parsedGreetingLine: fields.greetingLine || null,
    parsedGreetingName: fields.greetingName || null,
    parsedAmount: fields.amount,
    parsedDate: fields.date ? new Date(fields.date).toISOString() : null,
    status,
    skipReason,
    wouldImport: status === 'ready' && Boolean(importBank?._id),
  };
}

async function scanGmailMessages({ limit = 25, mode = 'unread' } = {}) {
  const { host, port, secure, user, pass } = getImapConfig();

  if (!user || !pass) {
    throw new Error('GMAIL_IMAP_USER and GMAIL_IMAP_APP_PASSWORD are required.');
  }

  const allowedSenders = getConfiguredAllowedSenders();
  const allowedSubjects = getConfiguredAllowedSubjects();
  const bankAccount = await resolveBankAccount();
  const bankByPayoneerId = await loadBankAccountsByPayoneerId();
  const client = new ImapFlow({ host, port, secure, auth: { user, pass } });

  const result = {
    scanned: 0,
    mode,
    imapFiltered: false,
    matchingInboxTotal: null,
    allowedSenders,
    allowedSubjects,
    messages: [],
    errors: [],
  };

  await client.connect();
  try {
    const mailbox = await client.mailboxOpen('INBOX');
    const total = mailbox.exists || 0;

    result.inboxTotal = total;

    const filtered = await searchFilteredMessageUids(client, {
      mode,
      limit,
      allowedSenders,
      allowedSubjects,
    });

    const processOpts = { allowedSenders, allowedSubjects, bankAccount, bankByPayoneerId };

    if (filtered) {
      result.imapFiltered = true;
      result.matchingInboxTotal = filtered.matchingInboxTotal;

      if (!filtered.uids.length) {
        return finalizeScanResult(result);
      }

      for await (const msg of client.fetch(filtered.uids, {
        envelope: true,
        source: true,
        uid: true,
        internalDate: true,
        flags: true,
      }, { uid: true })) {
        result.scanned += 1;
        result.messages.push(await processScannedMessage(msg, processOpts));
      }

      result.messages.sort((a, b) => (b.uid || 0) - (a.uid || 0));
      return finalizeScanResult(result);
    }

    let fetchQuery;
    let maxToProcess = limit;
    if (mode === 'all') {
      const cap = Math.min(total, Math.max(1, limit));
      const start = Math.max(1, total - cap + 1);
      fetchQuery = `${start}:*`;
      maxToProcess = cap;
    } else if (mode === 'recent') {
      const start = Math.max(1, total - limit + 1);
      fetchQuery = `${start}:*`;
      maxToProcess = limit;
    } else {
      fetchQuery = { seen: false };
      maxToProcess = limit;
    }

    let fetched = 0;
    for await (const msg of client.fetch(fetchQuery, {
      envelope: true,
      source: true,
      uid: true,
      internalDate: true,
      flags: true,
    })) {
      if (mode === 'unread' && fetched >= maxToProcess) break;
      if ((mode === 'recent' || mode === 'all') && fetched >= maxToProcess) break;
      fetched += 1;
      result.scanned += 1;
      result.messages.push(await processScannedMessage(msg, processOpts));
    }

    if (mode === 'recent' || mode === 'all') {
      result.messages.sort((a, b) => (b.uid || 0) - (a.uid || 0));
      result.messages = result.messages.slice(0, maxToProcess);
    }
  } finally {
    await client.logout();
  }

  return finalizeScanResult(result);
}

function finalizeScanResult(result) {
  result.ready = result.messages.filter((m) => m.status === 'ready').length;
  result.skipped = result.messages.filter((m) => m.status === 'skipped').length;
  return result;
}

/** Preview only — does not create transactions or mark mail processed. */
export async function previewTransactionsFromGmail(options = {}) {
  const mode = normalizePreviewMode(options.mode);
  const defaultLimit = mode === 'unread' ? 25 : PREVIEW_LIMIT_DEFAULT;
  const limit = Math.max(1, Math.min(PREVIEW_LIMIT_MAX, Number(options.limit) || defaultLimit));
  return scanGmailMessages({ limit, mode });
}

export async function importTransactionsFromGmail({ limit = 25 } = {}) {
  const { user, pass } = getImapConfig();
  if (!user || !pass) {
    throw new Error('GMAIL_IMAP_USER and GMAIL_IMAP_APP_PASSWORD are required.');
  }

  const bankAccount = await resolveBankAccount();
  if (!bankAccount?._id) {
    throw new Error(
      'No bank account found. Create one first, or set GMAIL_IMPORT_BANK_ACCOUNT_ID (preferred if names duplicate) or GMAIL_IMPORT_BANK_ACCOUNT_NAME.'
    );
  }

  const scan = await scanGmailMessages({ limit, mode: 'unread' });
  const bankByPayoneerId = await loadBankAccountsByPayoneerId();
  const importResult = {
    scanned: scan.scanned,
    imported: 0,
    skipped: 0,
    errors: [...scan.errors],
    messages: [],
  };

  for (const row of scan.messages) {
    if (row.status !== 'ready') {
      importResult.skipped += 1;
      continue;
    }

    const targetBank = resolveBankForCustomer(row.parsedCustomerId, bankAccount, bankByPayoneerId);
    if (!targetBank?._id) {
      importResult.skipped += 1;
      continue;
    }

    try {
      const transaction = await Transaction.create({
        date: new Date(row.parsedDate),
        bankAccount: targetBank._id,
        transactionType: 'Credit',
        amount: row.parsedAmount,
        remark: `Gmail import: ${row.subject}`.slice(0, 280),
        source: 'MANUAL',
      });

      await GmailProcessedMail.create({
        messageId: row.messageId,
        from: row.from,
        subject: row.subject,
        parsedDate: new Date(row.parsedDate),
        parsedAmount: row.parsedAmount,
        parsedBankAccountName: targetBank.name,
        transactionId: transaction._id,
      });
      importResult.imported += 1;
    } catch (e) {
      importResult.errors.push(`UID ${row.uid}: ${e.message}`);
      importResult.skipped += 1;
    }
  }

  return importResult;
}
