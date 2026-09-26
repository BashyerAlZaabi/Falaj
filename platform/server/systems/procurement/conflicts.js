// Conflicts of interest declared in the integrity system (optional dependency).
// Minimal contract: integrity.declaredConflicts(userId) → [{ party_name, provider_id, status }].
// Used for committee recusal and for the officer / legal reviewer guards.
let integrity;
export async function declaredConflicts(userId) {
  if (integrity === undefined) { try { integrity = await import('../integrity.js'); } catch { integrity = null; } }
  const fn = integrity?.declaredConflicts;
  if (typeof fn !== 'function') return [];
  try { const out = await fn(userId); return Array.isArray(out) ? out : []; } catch { return []; }
}
const INACTIVE = new Set(['withdrawn', 'rejected', 'cancelled', 'draft', 'closed_no_conflict']);
const normName = (s) => String(s || '').toLowerCase().replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim();
// First (conflict, provider) pair where a declared conflict matches a provider
// (by provider organisation id, or by name).
export function conflictWith(conflicts, providers) {
  for (const c of conflicts) {
    if (INACTIVE.has(String(c.status || '').toLowerCase())) continue;
    for (const p of providers) {
      if (!p) continue;
      const pn = [normName(p.name_ar), normName(p.name_en)].filter(Boolean);
      const cn = normName(c.party_name);
      if ((c.provider_id && (c.provider_id === p.id || c.provider_id === p.org_id)) || (cn && cn.length > 3 && pn.some((n) => n.includes(cn) || cn.includes(n)))) return { conflict: c, provider: p };
    }
  }
  return null;
}
// Does this user have a declared conflict with any of these providers?
export async function userConflictWith(userId, providers) {
  return conflictWith(await declaredConflicts(userId), providers.filter(Boolean));
}
