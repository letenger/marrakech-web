// A local acknowledgement prevents reconnects/refreshes from reopening a rent
// dialog the player already read. Money is always settled by the server.
const KEY = 'marrakech-online-rent-v1';
type Receipts = { guestId: string; matchId: string; ids: string[] };
export function rentReceipts(guestId: string, matchId: string): Set<string> {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Receipts | null;
    if (value?.guestId === guestId && value.matchId === matchId && Array.isArray(value.ids)) return new Set(value.ids.filter(id => typeof id === 'string'));
  } catch { /* Storage can be disabled. In-memory deduplication still works. */ }
  return new Set();
}
export function acknowledgeRent(guestId: string, matchId: string, id: string) {
  const ids = [...rentReceipts(guestId, matchId), id].slice(-64);
  try { localStorage.setItem(KEY, JSON.stringify({ guestId, matchId, ids })); } catch { /* Optional local receipt. */ }
}
