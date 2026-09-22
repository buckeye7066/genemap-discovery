export function ownerOnlyEnabled(env = process.env) {
  if (String(env.NODE_ENV || '').trim().toLowerCase() === 'test' || env.VITEST) return false
  return String(env.OWNER_ONLY_MODE ?? 'true').trim().toLowerCase() !== 'false'
}

export function isOwnerEmail(email, env = process.env) {
  if (!ownerOnlyEnabled(env)) return true
  const normalized = String(email || '').trim().toLowerCase()
  const ownerEmail = String(env.OWNER_EMAIL || '').trim().toLowerCase()
  return Boolean(ownerEmail) && normalized === ownerEmail
}
