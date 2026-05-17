/**
 * Shared ledger identity for balances: one real bank account = one key.
 * Multiple BankAccount rows with the same name + account number share one running balance.
 * Rows without account number stay separate (key includes Mongo _id).
 */
export function bankAccountLedgerKey(bank) {
    if (!bank) return '';
    const name = String(bank.name || '')
        .trim()
        .toLowerCase();
    const acct = String(bank.accountNumber || '').replace(/\s/g, '');
    if (acct) return `${name}::${acct}`;
    const id = bank._id != null ? String(bank._id) : '';
    return id ? `${name}::${id}` : name;
}

/** Match Front `bankAccountMenuLabel` for API/CSV labels. */
export function bankAccountDisplayLabel(bank) {
    if (!bank) return '';
    const name = String(bank.name || '').trim() || 'Bank';
    const digits = String(bank.accountNumber || '').replace(/\D/g, '');
    const mask = digits.length >= 4 ? `****${digits.slice(-4)}` : digits ? `****${digits}` : '';
    if (mask) return `${name} (${mask})`;
    const id = String(bank._id || '');
    const tail = id.length >= 6 ? id.slice(-6) : id;
    return tail ? `${name} (#${tail})` : name;
}
