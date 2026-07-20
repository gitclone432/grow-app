/** Display label for a seller option (matches common dropdown rendering). */
export function sellerDisplayName(seller) {
  return String(
    seller?.user?.username
      || seller?.username
      || seller?.user?.email
      || seller?.email
      || seller?._id
      || '',
  );
}

/** Sort sellers A→Z by display name (case-insensitive). Does not mutate the input. */
export function sortSellersByName(sellers) {
  return [...(sellers || [])].sort((a, b) =>
    sellerDisplayName(a).localeCompare(sellerDisplayName(b), undefined, { sensitivity: 'base' }),
  );
}
