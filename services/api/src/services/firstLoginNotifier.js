/**
 * Stamp lastLoginAt after a successful sign-in.
 *
 * Publication builds do not emit owner emails or export the user's email,
 * name, identifier, or sign-in method. The helper remains fire-and-forget and
 * failure-tolerant so authentication is never coupled to telemetry.
 */
export async function recordSuccessfulLogin({ prisma, user } = {}) {
  try {
    if (!prisma?.user?.update || !user?.id) return { skipped: true };

    const firstLogin = !user.lastLoginAt;
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return { ok: true, firstLogin, notified: false };
  } catch {
    console.warn('[firstLoginNotifier] last-login stamp failed');
    return { ok: false };
  }
}

export default { recordSuccessfulLogin };
