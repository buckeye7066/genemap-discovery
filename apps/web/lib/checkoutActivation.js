function waitForNextAttempt(delayMs, signal) {
  if (!delayMs || signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(finish, delayMs);
    function finish() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', finish);
      resolve();
    }
    signal?.addEventListener('abort', finish, { once: true });
  });
}

/**
 * Poll the server-owned checkout activation contract. A success query string
 * is deliberately not an input to this decision; only the owner-bound Stripe
 * session plus its webhook-created entitlement can produce `active`.
 */
export async function pollCheckoutActivation({
  sessionId,
  expectedKind,
  getStatus,
  attempts = 20,
  delayMs = 1_000,
  signal = undefined,
}) {
  if (!sessionId || typeof getStatus !== 'function') {
    throw new Error('A checkout session and status loader are required');
  }

  let lastStatus = null;
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (signal?.aborted) return { outcome: 'cancelled', status: lastStatus };
    try {
      lastStatus = await getStatus(sessionId);
      lastError = null;
      if (expectedKind && lastStatus?.kind !== expectedKind) {
        return { outcome: 'wrong_kind', status: lastStatus };
      }
      if (lastStatus?.state === 'active' && lastStatus.entitlementActive === true) {
        return { outcome: 'active', status: lastStatus };
      }
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts - 1) await waitForNextAttempt(delayMs, signal);
  }

  if (signal?.aborted) return { outcome: 'cancelled', status: lastStatus };
  return { outcome: 'pending', status: lastStatus, error: lastError };
}
