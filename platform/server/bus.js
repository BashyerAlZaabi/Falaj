// Per-user realtime channel (Server-Sent Events). Messages only carry entity
// type + id; clients refetch through authorised APIs.
const clients = new Map(); // userId -> Set<res>

export function subscribe(userId, res) {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(res);
  return () => clients.get(userId)?.delete(res);
}

export function notify(userIds, event) {
  const payload = `data: ${JSON.stringify({ ...event, at: new Date().toISOString() })}\n\n`;
  for (const id of new Set(userIds)) for (const res of clients.get(id) || []) res.write(payload);
}

export function connectedCount() { let n = 0; for (const s of clients.values()) n += s.size; return n; }
