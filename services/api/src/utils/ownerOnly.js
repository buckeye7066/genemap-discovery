export function ownerOnlyEnabled(env = process.env) {
  if (String(env.NODE_ENV || '').trim().toLowerCase() === 'test' || env.VITEST) return false
  return String(env.OWNER_ONLY_MODE ?? 'true').trim().toLowerCase() !== 'false'
}

export function ownerEmails(env = process.env) {
  return String(env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
}

export function isOwnerEmail(email, env = process.env) {
  if (!ownerOnlyEnabled(env)) return true
  const normalized = String(email || '').trim().toLowerCase()
  return Boolean(normalized) && ownerEmails(env).includes(normalized)
}
