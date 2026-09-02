import React from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, ArrowLeft } from "lucide-react";

/**
 * Privacy Policy for the public education/research product. It describes the
 * published data flows and the fail-closed boundary around personal clinical
 * and genomic information. Have counsel review before commercial reliance.
 */
const UPDATED = "September 2, 2026";
const CONTACT = "dr.johnwhite@axiombiolabs.org";

function Section({ title, children }) {
  return (
    <section className="mb-7">
      <h2 className="text-lg font-semibold text-slate-900 mb-2">{title}</h2>
      <div className="text-slate-700 leading-relaxed space-y-2 text-sm">{children}</div>
    </section>
  );
}

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
      <div className="max-w-3xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to GeneMap
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Privacy Policy</h1>
        </div>
        <p className="text-sm text-slate-500 mb-8">Last updated: {UPDATED}</p>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8">
          <Section title="Who we are">
            <p>
              GeneMap is operated by Axiom Biolabs for genetics education and exploratory early research.
              It does not provide medical advice, diagnosis, treatment, individualized health-risk
              interpretation, medication selection, or dosing. AI-generated content may be incomplete or
              wrong and must not be used for clinical decisions.
            </p>
            <p>
              The service is not designed for clinical use and is not represented as HIPAA-compliant or as a
              medical-record system. Premium users may choose to store their own health profile and locally
              extracted lab-document content for educational use. Do not submit another person&apos;s information,
              data you lack authority to process, or data that your organization requires to be handled under
              a business associate agreement.
            </p>
          </Section>

          <Section title="Information we collect">
            <ul className="list-disc ml-5 space-y-1">
              <li>
                <strong>Account and profile data:</strong> email, password hash, session records, education
                level, and any name, phone number, age, study or research profile, profile image, and mailing
                preference you choose to add.
              </li>
              <li>
                <strong>Learning and usage data:</strong> topics viewed, quiz responses and scores, learning
                progress, activity records, searches, and selected gene, HPO, or MONDO identifiers. New
                phenotype and disease history uses normalized structured references; legacy search records
                may remain.
              </li>
              <li>
                <strong>Research and user content:</strong> bounded education or aggregate-research task
                inputs and generated outputs, saved gene sets, research-project titles and descriptions,
                project versions, annotations, and support messages.
              </li>
              <li>
                <strong>Optional health and assistant content:</strong> health-profile fields, structured lab
                observations, locally extracted document text, parser provenance, and assistant conversations
                you choose to save. The original lab file is processed in the browser and is not uploaded by
                this flow. Saved health content, record titles, conversation messages, and related metadata are
                encrypted at rest and owner-scoped.
              </li>
              <li>
                <strong>Technical and security data:</strong> request IP and device metadata, requested
                routes or assets, consent and audit records, exceptions, performance information, and
                operational logs.
              </li>
              <li>
                <strong>Billing data:</strong> customer and subscription identifiers, subscription status,
                contact fields supplied to checkout, and webhook identifiers. Stripe-hosted payment surfaces
                handle full card details.
              </li>
              <li>
                <strong>Account-deletion tombstones:</strong> after permanent deletion is authorized, a
                restore-independent ledger may retain a keyed one-way account identifier, deletion receipt,
                authorization time, release identity, and completed billing-cleanup counts. It does not
                receive the raw email, name, profile, searches, research content, or medical information.
                The tombstone exists to stop an older database backup from resurrecting a deleted account.
              </li>
            </ul>
          </Section>

          <Section title="How we use information">
            <p>
              We use information to authenticate accounts, provide searches and structured education or
              early-research features, record learning progress, maintain saved projects, process
              subscriptions, respond to support and deletion requests, protect the service, and produce
              aggregate operational analytics. With separate, current consent, profile-aware assistants use
              owner-scoped profile, research, and saved health context to answer the user&apos;s question and return
              a context receipt. We do not sell personal data or use it for third-party advertising.
            </p>
          </Section>

          <Section title="Health and model-execution boundary">
            <p>
              The health-document flow performs PDF text extraction and OCR in the browser, validates and
              normalizes the result, and sends only the structured result and bounded extracted text to the
              encrypted record API. The profile-aware assistant route builds context on the server from records
              owned by the authenticated user; it does not accept a caller-supplied system prompt or context
              object. Health storage and model analysis require separate versioned consents, and the latest
              revocation supersedes an older grant. GeneMap still does not provide diagnosis, individualized
              risk determination, clinical decision support, medication selection, or dosing.
            </p>
          </Section>

          <Section title="How your data is protected and accessed">
            <p>
              Authentication uses signed, HTTP-only cookies with CSRF protection, and production traffic is
              served over HTTPS. Account APIs apply authentication and role checks. Account data is not
              accessible only to the account holder: authorized Axiom Biolabs operators may access account
              and service records when needed for support, security, deletion, billing, or legal obligations.
              Operator access must be role-restricted, logged, purpose-limited, and reviewed before release.
              The administrator analytics endpoint is separately limited to totals and allowlisted aggregate
              categories rather than raw searches, identities, medical or conversation records, or activity
              metadata.
            </p>
            <p>
              No online service can guarantee absolute security. Avoid submitting sensitive personal
              information that GeneMap does not require.
            </p>
          </Section>

          <Section title="Service providers and scientific lookups">
            <ul className="list-disc ml-5 space-y-1">
              <li>
                <strong>Vercel:</strong> active web host and CDN. It receives request IP and device metadata,
                requested pages or static assets, and deployment logs. Application API content is served
                from the separate API origin and is not intentionally submitted to Vercel as content.
              </li>
              <li>
                <strong>Railway:</strong> active API and PostgreSQL host. It stores or processes account,
                authentication and session data, research content, search history, projects, billing
                identifiers, operational logs, and encrypted health-record and assistant-conversation columns.
              </li>
              <li>
                <strong>OpenAI API and Anthropic API:</strong> OpenAI is the default text-generation provider
                unless deployment configuration selects Anthropic as the alternate. The selected provider
                receives versioned structured education or aggregate early-research inputs, resolved
                gene or ontology identifiers, and generated output. When a user separately consents to
                health-data analysis, the selected provider also receives the bounded server-built profile,
                research, and saved health context needed for that assistant request. Application error
                messages and stacks are not sent to these providers.
              </li>
              <li>
                <strong>Stripe:</strong> processes web subscription checkout, customer and subscription
                identifiers, supplied contact fields, subscription status, and webhook event identifiers.
              </li>
              <li>
                <strong>Independent account-deletion ledger:</strong> when configured, receives only the
                bounded deletion-tombstone fields described above. The production operator, region,
                retention, deletion policy, key custody, and executed agreement must be recorded in the
                processor register before public production reliance.
              </li>
              <li>
                <strong>Resend:</strong> when configured, receives finite, redacted operational alerts for
                critical account-deletion failures. Those alerts exclude account identifiers, names,
                addresses, user content, error stacks, and health data. It is not used for collaborator or
                institutional-seat invitations.
              </li>
              <li>
                <strong>Redis rate-limit operator:</strong> if configured, receives rate-limit keys and
                counters plus connection or health metadata. The production vendor, region, key fields, and
                retention settings have not yet been documented.
              </li>
              <li>
                <strong>NLM Clinical Tables, Monarch Initiative, MyGene.info, and Open Targets:</strong>
                active scientific lookup services receive phenotype search text or exact HPO identifiers,
                disease search text or exact MONDO identifiers, human-gene symbols and fixed requested
                fields, or an exact MONDO-derived disease identifier for target-association lookup. GeneMap
                uses the bounded candidate-symbol set locally to select returned Open Targets rows. These
                requests originate from the API but may remain user-linked within GeneMap. Open Targets
                results are displayed only as computed research-comparison signals, never as clinical
                conclusions. These services are lookup and follow-up sources, not automatic verification
                of an AI-generated claim, and are not represented here as contracted processors.
              </li>
            </ul>
            <p>
              Exact production regions, provider retention and deletion settings, executed agreements,
              subprocessor reviews, and deletion propagation have not yet been fully documented. No BAA or
              clinical authorization is evidenced for the current production configuration. GeneMap does
              not claim that its processor review, HIPAA readiness, or clinical readiness is complete.
            </p>
          </Section>

          <Section title="Your choices & rights">
            <ul className="list-disc ml-5 space-y-1">
              <li>View and edit the profile fields available in your account.</li>
              <li>Grant or revoke health storage and assistant-analysis consent separately.</li>
              <li>Delete individual saved health records and assistant conversations.</li>
              <li>Request an export or deletion of your account and associated application data.</li>
              <li>Ask us to identify and remove legacy records retained from an earlier release.</li>
              <li>Opt out of the mailing list from your profile settings.</li>
              <li>Contact us for the scope and status of an export or deletion request.</li>
            </ul>
          </Section>

          <Section title="Data retention">
            <p>
              We retain account and application data while needed to operate the service and for support,
              security, billing, or legal purposes. Fixed retention schedules for hosting logs, backups,
              model-provider records, any future service email, rate-limit data, and deletion-ledger
              tombstones have not yet been fully documented. A deletion request may be subject to billing or
              legal-retention exceptions, and deletion propagation to provider logs and backups has not yet
              been verified. The independent tombstone is deliberately retained outside the application
              database so a restored backup can be reconciled before service exposure. We therefore do not
              promise that deleting an application record immediately removes every provider or backup copy.
            </p>
          </Section>

          <Section title="Children">
            <p>GeneMap is not directed to children under 13, and we do not knowingly collect their data.</p>
          </Section>

          <Section title="Changes & contact">
            <p>
              We may update this policy; material changes will be reflected by the “Last updated” date.
              Questions or requests: <a className="text-blue-600 hover:underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.
            </p>
          </Section>

          <p className="text-xs text-slate-400 mt-6">
            This policy is provided in good faith for transparency and is not legal advice. Have qualified
            counsel review and adapt it before relying on it for a commercial or regulated deployment.
          </p>
        </div>

        <p className="text-center text-sm text-slate-500 mt-6">
          See also our <Link to="/termsofservice" className="text-blue-600 hover:underline">Terms of Service</Link>.
        </p>
      </div>
    </div>
  );
}
