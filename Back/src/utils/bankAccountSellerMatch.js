const MONGO_ID_HEX = /^[a-f0-9]{24}$/i;

/**
 * Whether a seller document matches BankAccount.sellers (comma-separated seller ids and/or legacy tokens).
 */
export function sellerMatchesBankSellersField(bankSellersStr, seller) {
    if (!bankSellersStr?.trim()) return false;
    const raw = bankSellersStr
        .split(/[,;]+/)
        .map((t) => t.trim())
        .filter(Boolean);
    const sid = String(seller._id);
    for (const t of raw) {
        if (MONGO_ID_HEX.test(t) && sid === t) return true;
    }
    const username = (seller.user?.username || seller.user?.email || '').toLowerCase();
    if (!username) return false;
    return raw.some((t) => {
        if (MONGO_ID_HEX.test(t)) return false;
        const tl = t.toLowerCase();
        return username === tl || username.includes(tl);
    });
}
