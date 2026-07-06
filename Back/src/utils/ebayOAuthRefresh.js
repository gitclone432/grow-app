/**
 * Build the body for eBay refresh_token grant requests.
 *
 * Do not send the app's full scope list on refresh — eBay returns invalid_scope
 * when requested scopes exceed what the seller granted at connect time.
 * Omitting scope uses the original consent scopes (eBay default).
 *
 * @see https://developer.ebay.com/api-docs/static/oauth-refresh-token-request.html
 */
export function buildRefreshTokenParams(seller) {
  return {
    grant_type: 'refresh_token',
    refresh_token: seller.ebayTokens.refresh_token,
  };
}
