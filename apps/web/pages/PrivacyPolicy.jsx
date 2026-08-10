import React from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, ArrowLeft } from "lucide-react";

/**
 * Privacy Policy for the public education/research product. It describes the
 * published data flows and the fail-closed boundary around personal clinical
 * and genomic information. Have counsel review before commercial reliance.
 */
const UPDATED = "August 9, 2026";
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
              The public service is not designed for clinical use and is not represented as HIPAA-compliant
              or authorized to process protected health information. Do not submit personal medical records,
              personal genomic files, protected health information, or information that identifies a patient.
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
                <strong>Legacy data:</strong> earlier releases may have stored medical-record or
                AI-conversation records. Encrypted legacy columns may remain in the hosted database, but the
                public generation routes do not use them. You may request their export or deletion.
              </li>
            </ul>
          </Section>

          <Section title="How we use information">
            <p>
              We use information to authenticate accounts, provide searches and structured education or
              early-research features, record learning progress, maintain saved projects, process
              subscriptions, respond to support and deletion requests, protect the service, and produce
              aggregate operational analytics. We do not sell personal data or use it for third-party
              advertising.
            </p>
          </Section>

          <Section title="Publication-mode data boundary">
            <p>
              The public build does not provide routes for personal medical-record upload, personal VCF
              analysis, diagnosis, individualized risk interpretation, pharmacogenomic recommendations,
              medication selection, or dosing. Public model-execution routes accept only finite, versioned,
              structured education and exploratory-research tasks. Free-text profile, project, annotation,
              and support fields still exist, so do not place personal medical, genomic, or
              patient-identifying information in any field.
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
                identifiers, operational logs, and encrypted legacy medical or conversation columns.
              </li>
              <li>
                <strong>OpenAI API and Anthropic API:</strong> OpenAI is the default text-generation provider
                unless deployment configuration selects Anthropic as the alternate. The selected provider
                receives versioned structured education or aggregate early-research inputs, resolved
                gene or ontology identifiers, and generated output. Application error messages and
                stacks are not sent to these providers.
              </li>
              <li>
                <strong>Stripe:</strong> processes web subscription checkout, customer and subscription
                identifiers, supplied contact fields, subscription status, and webhook event identifiers.
              </li>
              <li>
                <strong>Resend:</strong> the email integration remains installed but is not invoked by the
                current publication build. First-login identity and error-report emails are disabled.
                Any future service-email flow requires a new purpose, field, and retention review.
              </li>
              <li>
                <strong>Sentry:</strong> external browser and API exception export is disabled in the
                current publication build even if a DSN is configured. Application errors are reduced to
                finite local operational events and are not sent to Sentry.
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
                fields, or an exact MONDO-derived disease identifier plus a bounded candidate-symbol set for
                target-association lookup. These requests originate from the API but may remain user-linked
                within GeneMap. Open Targets results are displayed only as computed research-comparison
                signals, never as clinical conclusions. These services are lookup and follow-up sources, not
                automatic verification of an AI-generated claim, and are not represented here as contracted
                processors.
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
              model-provider records, hosting logs, any future service email, and rate-limit data have not
              yet been fully documented. A deletion request may be subject to billing or legal-retention exceptions, and
              deletion propagation to provider logs and backups has not yet been verified. We therefore do
              not promise that deleting an application record immediately removes every provider or backup
              copy.
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

