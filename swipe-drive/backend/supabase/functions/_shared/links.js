/* Push alert link: open the deck on the alerted car. The app's buildDeck() moves ?reg= to the front of the deck.
   With several cars in one push, the first (best) one leads. src=alert tags the visit. */
export function pushUrl(app, items) {
  const c = items && items[0] && items[0].car;
  return c && c.reg ? app + '?reg=' + encodeURIComponent(c.reg) + '&src=alert' : app;
}
