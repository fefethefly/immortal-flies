/** Venue HTTP：只读报价，无 calldata。 */
export function mountVenueRoutes({ router, venue }) {
  router.add("GET", "/v1/venue/quotes", async () => venue.getQuotes());
}
