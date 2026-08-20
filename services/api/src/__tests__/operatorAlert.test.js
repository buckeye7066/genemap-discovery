import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../utils/errors.js';
import { createPrismaMock } from './setup.js';
import { closeUserAccount } from '../services/accountClosure.js';
import {
  LEDGER_WRITE_FAILURE,
  REDACTED,
  emitOperatorAlert,
  operatorAlertRecipients,
  operatorAlertStatus,
  redactDetails,
} from '../services/operatorAlert.js';

const ENV = {
  ADMIN_EMAILS: 'ops@example.invalid, oncall@example.invalid',
  RESEND_API_KEY: 'test-key',
  RELEASE_SHA: 'f'.repeat(40),
};

function loggerMock() {
  return { error: vi.fn() };
}

describe('operatorAlert', () => {
  it('reports configured only when both a sender and a recipient exist', () => {
    expect(operatorAlertStatus(ENV)).toMatchObject({
      channel: 'email',
      recipientsConfigured: 2,
      senderConfigured: true,
      configured: true,
    });
    expect(operatorAlertStatus({ ADMIN_EMAILS: 'ops@example.invalid' }).configured).toBe(false);
    expect(operatorAlertStatus({ RESEND_API_KEY: 'k' }).configured).toBe(false);
    expect(operatorAlertRecipients({ ADMIN_EMAILS: ' a@x.invalid , , b@x.invalid ' }))
      .toEqual(['a@x.invalid', 'b@x.invalid']);
  });

  it('emails every configured operator and records the alert on stderr', async () => {
    const sendEmail = vi.fn(async () => ({ ok: true, id: 'email-1' }));
    const logger = loggerMock();

    const result = await emitOperatorAlert(
      {
        kind: LEDGER_WRITE_FAILURE,
        summary: 'ledger write failed',
        details: { receiptId: 'receipt-42', code: 'ACCOUNT_DELETE_LEDGER_WRITE_FAILED' },
      },
      { env: ENV, sendEmail, logger },
    );

    expect(result).toEqual({
      kind: LEDGER_WRITE_FAILURE,
      logged: true,
      emailed: true,
      reason: null,
    });
    expect(sendEmail).toHaveBeenCalledOnce();
    const sent = sendEmail.mock.calls[0][0];
    expect(sent.to).toEqual(['ops@example.invalid', 'oncall@example.invalid']);
    expect(sent.subject).toContain(LEDGER_WRITE_FAILURE);
    expect(sent.text).toContain('receipt-42');

    const logged = JSON.parse(logger.error.mock.calls[0][0].replace('[operator-alert] ', ''));
    expect(logged).toMatchObject({
      kind: LEDGER_WRITE_FAILURE,
      severity: 'critical',
      releaseSha: 'f'.repeat(40),
      details: { receiptId: 'receipt-42' },
    });
  });

  it('still records the alert when no mailbox is configured', async () => {
    const sendEmail = vi.fn();
    const logger = loggerMock();

    const result = await emitOperatorAlert(
      { kind: LEDGER_WRITE_FAILURE, summary: 'x' },
      { env: { RELEASE_SHA: 'a'.repeat(40) }, sendEmail, logger },
    );

    expect(result).toMatchObject({ logged: true, emailed: false, reason: 'no_recipients' });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it('never throws, and never masks the failure it is reporting, when delivery breaks', async () => {
    const logger = loggerMock();
    const threw = await emitOperatorAlert(
      { kind: LEDGER_WRITE_FAILURE },
      { env: ENV, sendEmail: vi.fn(async () => { throw new Error('resend outage'); }), logger },
    );
    expect(threw).toMatchObject({ logged: true, emailed: false, reason: 'send_threw' });

    const refused = await emitOperatorAlert(
      { kind: LEDGER_WRITE_FAILURE },
      { env: ENV, sendEmail: vi.fn(async () => ({ ok: false, reason: 'no_api_key' })), logger },
    );
    expect(refused).toMatchObject({ logged: true, emailed: false, reason: 'no_api_key' });
  });
});

describe('account closure ledger write failure alerting', () => {
  function seedUser(prisma) {
    const user = {
      id: 'user-alert-1',
      email: 'alert-me@example.invalid',
      passwordHash: 'unused',
      role: 'user',
      banned: false,
    };
    prisma._store.user.push(user);
    return user;
  }

  function ledgerMock(overrides = {}) {
    return {
      configured: true,
      hashIdentity: vi.fn((value) => `hash:${value}`),
      authorize: vi.fn(async ({ receiptId }) => ({ mode: 'external', recorded: true, receiptId })),
      ...overrides,
    };
  }

  function stripeMock() {
    return {
      subscriptions: { cancel: vi.fn(async () => ({ status: 'canceled' })) },
      customers: { del: vi.fn(async () => ({ deleted: true })) },
      checkout: {
        sessions: {
          retrieve: vi.fn(async (id) => ({ id, status: 'open' })),
          expire: vi.fn(async (id) => ({ id, status: 'expired' })),
        },
      },
    };
  }

  it('alerts an operator when the deletion ledger write fails', async () => {
    const prisma = createPrismaMock();
    const user = seedUser(prisma);
    const ledgerError = new AppError('ledger unavailable', 503);
    ledgerError.code = 'ACCOUNT_DELETE_LEDGER_WRITE_FAILED';
    const alert = vi.fn(async () => ({ logged: true, emailed: true }));

    await expect(closeUserAccount({
      prisma,
      user,
      actorUserId: user.id,
      stripeClient: stripeMock(),
      ledger: ledgerMock({ authorize: vi.fn(async () => { throw ledgerError; }) }),
      alert,
    })).rejects.toMatchObject({ code: 'ACCOUNT_DELETE_LEDGER_WRITE_FAILED' });

    expect(alert).toHaveBeenCalledOnce();
    const payload = alert.mock.calls[0][0];
    expect(payload.kind).toBe(LEDGER_WRITE_FAILURE);
    expect(payload.severity).toBe('critical');
    expect(payload.details.code).toBe('ACCOUNT_DELETE_LEDGER_WRITE_FAILED');
    expect(payload.details.receiptId).toEqual(expect.any(String));
    // The alert must never carry identifying data off the platform.
    expect(JSON.stringify(payload)).not.toContain(user.email);
    expect(JSON.stringify(payload)).not.toContain(user.id);
    // The account was NOT deleted — that is precisely why a human is needed.
    expect(prisma._store.user).toHaveLength(1);
  });

  it('does not alert for a non-ledger billing failure, and not at all on success', async () => {
    const prisma = createPrismaMock();
    const user = seedUser(prisma);
    const alert = vi.fn(async () => ({ logged: true }));

    await closeUserAccount({
      prisma,
      user,
      actorUserId: user.id,
      stripeClient: stripeMock(),
      ledger: ledgerMock(),
      alert,
    });
    expect(alert).not.toHaveBeenCalled();

    const prisma2 = createPrismaMock();
    const user2 = seedUser(prisma2);
    prisma2._store.subscription.push({
      id: 'sub-row-alert',
      userId: user2.id,
      stripeSubscriptionId: 'sub_alert_fixture',
      stripeCustomerId: 'cus_alert_fixture',
      status: 'active',
    });
    const billingStripe = stripeMock();
    billingStripe.subscriptions.cancel = vi.fn(async () => { throw new Error('stripe outage'); });
    const alert2 = vi.fn(async () => ({ logged: true }));

    await expect(closeUserAccount({
      prisma: prisma2,
      user: user2,
      actorUserId: user2.id,
      stripeClient: billingStripe,
      ledger: ledgerMock(),
      alert: alert2,
    })).rejects.toBeTruthy();
    expect(alert2).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Redaction is ENFORCED, not a caller convention (2026-08-19).
// This path hands data to an EXTERNAL PROCESSOR (Resend). The alerts most
// likely to be added next are about account deletion, so "callers must pass
// only non-identifying details" living in a comment is not a control.
// ---------------------------------------------------------------------------
describe('operator alert redaction', () => {
  it('redacts identifying keys and email-shaped values', () => {
    const out = redactDetails({
      receiptId: 'r-123',
      code: 'ECONNRESET',
      actorMode: 'self_service',
      checkoutSessionsExpired: 2,
      email: 'someone@example.com',
      userId: 'u-9',
      nested: { contactEmail: 'a@b.co', stage: 'ledger_write' },
      note: 'contact jane.doe@genemap.org for details',
    });
    // Operational fields survive — an over-eager redactor makes alerts useless.
    expect(out.receiptId).toBe('r-123');
    expect(out.code).toBe('ECONNRESET');
    expect(out.actorMode).toBe('self_service');
    expect(out.checkoutSessionsExpired).toBe(2);
    expect(out.nested.stage).toBe('ledger_write');
    // Identifying material does not.
    expect(out.email).toBe(REDACTED);
    expect(out.userId).toBe(REDACTED);
    expect(out.nested.contactEmail).toBe(REDACTED);
    expect(out.note).toBe(REDACTED); // email inside free text
  });

  it('never mails an address even when a caller passes one', async () => {
    let sent = null;
    await emitOperatorAlert(
      {
        kind: 'test_alert',
        summary: 'deletion failed for patient@hospital.org',
        details: { userEmail: 'leak@example.com', receiptId: 'r-1' },
      },
      {
        env: { ADMIN_EMAILS: 'ops@example.com', RESEND_API_KEY: 'k' },
        sendEmail: async (m) => { sent = m; return { ok: true }; },
        logger: { error() {} },
      },
    );
    expect(sent).not.toBeNull();
    // The BODY is what reaches the processor. Redacting only the log line
    // would be a correction nothing consumes.
    expect(sent.text).not.toMatch(/leak@example\.com/);
    expect(sent.text).not.toMatch(/patient@hospital\.org/);
    expect(sent.text).toMatch(/r-1/); // operational detail still present
  });

  it('logs the redacted record, not the raw one', async () => {
    const lines = [];
    await emitOperatorAlert(
      { kind: 'k', details: { email: 'x@y.zz' } },
      {
        env: {},
        sendEmail: async () => ({ ok: true }),
        logger: { error: (l) => lines.push(String(l)) },
      },
    );
    expect(lines.join('\n')).not.toMatch(/x@y\.zz/);
  });
});
