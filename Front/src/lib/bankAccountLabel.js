/** Label for bank account dropdowns when multiple rows can share the same `name`. */
export function bankAccountMenuLabel(acc) {
    if (!acc) return '';
    const name = String(acc.name || '').trim() || 'Bank';
    const digits = String(acc.accountNumber || '').replace(/\D/g, '');
    const mask = digits.length >= 4 ? `****${digits.slice(-4)}` : digits ? `****${digits}` : '';
    if (mask) return `${name} (${mask})`;
    const id = String(acc._id || '');
    const tail = id.length >= 6 ? id.slice(-6) : id;
    return tail ? `${name} (#${tail})` : name;
}
