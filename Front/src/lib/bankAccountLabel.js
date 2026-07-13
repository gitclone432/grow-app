import { formatBankSellersHint } from './bankAccountSellers.js';

/** Same key as backend `bankAccountLedgerKey` — one real bank account. */
export function bankAccountLedgerKey(acc) {
    if (!acc) return '';
    const name = String(acc.name || '').trim().toLowerCase();
    const acct = String(acc.accountNumber || '').replace(/\s/g, '');
    if (acct) return `${name}::${acct}`;
    const id = acc._id != null ? String(acc._id) : '';
    return id ? `${name}::${id}` : name;
}

/** Name + mask only (no linked store suffix). */
export function bankAccountUniqueLabel(acc) {
    if (!acc) return '';
    const name = String(acc.name || '').trim() || 'Bank';
    const digits = String(acc.accountNumber || '').replace(/\D/g, '');
    const mask = digits.length >= 4 ? `****${digits.slice(-4)}` : digits ? `****${digits}` : '';
    if (mask) return `${name} (${mask})`;
    const id = String(acc._id || '');
    const tail = id.length >= 6 ? id.slice(-6) : id;
    return tail ? `${name} (#${tail})` : name;
}

/** One menu row per physical bank account (merged store-specific DB rows). */
export function uniqueBankAccountsByLedger(accounts = []) {
    const seen = new Map();
    for (const acc of accounts) {
        const key = bankAccountLedgerKey(acc);
        if (!seen.has(key)) seen.set(key, acc);
    }
    return [...seen.values()].sort((a, b) =>
        bankAccountUniqueLabel(a).localeCompare(bankAccountUniqueLabel(b), undefined, { sensitivity: 'base' })
    );
}

/** Label for bank account dropdowns when multiple rows can share the same `name`. */
export function bankAccountMenuLabel(acc, sellerOptions) {
    if (!acc) return '';
    const name = String(acc.name || '').trim() || 'Bank';
    const digits = String(acc.accountNumber || '').replace(/\D/g, '');
    const mask = digits.length >= 4 ? `****${digits.slice(-4)}` : digits ? `****${digits}` : '';
    let base;
    if (mask) base = `${name} (${mask})`;
    else {
        const id = String(acc._id || '');
        const tail = id.length >= 6 ? id.slice(-6) : id;
        base = tail ? `${name} (#${tail})` : name;
    }

    const sellerHint = acc.linkedSellerHint
        || formatBankSellersHint(acc.sellers, sellerOptions);
    return sellerHint ? `${base} · ${sellerHint}` : base;
}

const looksLikeMongoId = (s) => typeof s === 'string' && /^[a-f\d]{24}$/i.test(s.trim());

/**
 * How this row will read in Payoneer / Transactions menus (draft while typing, or saved row).
 */
export function bankAccountListLabelDraft(name, accountNumber, existingId) {
    const id = existingId != null ? String(existingId).trim() : '';
    if (looksLikeMongoId(id)) {
        return bankAccountMenuLabel({ name, accountNumber, _id: id });
    }
    const trimmed = String(name ?? '').trim();
    if (!trimmed) return '—';
    const digits = String(accountNumber || '').replace(/\D/g, '');
    const mask = digits.length >= 4 ? `****${digits.slice(-4)}` : digits ? `****${digits}` : '';
    if (mask) return `${trimmed} (${mask})`;
    return `${trimmed} (add account # to distinguish same-name rows)`;
}
