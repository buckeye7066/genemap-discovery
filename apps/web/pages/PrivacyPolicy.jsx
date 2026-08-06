import React from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, ArrowLeft } from "lucide-react";

/**
 * Privacy Policy for the public education/research product. It describes the
 * published data flows and the fail-closed boundary around personal clinical
 * and genomic information. Have counsel review before commercial reliance.
 */
const UPDATED = "August 5, 2026";
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
              GeneMap is an educational and research tool for understanding genetics, operated by Axiom
              Biolabs. It is <strong>not a medical device</strong> and does not provide medical diagnosis or
              treatment. AI-generated content may be inaccurate and must not be relied on for clinical
              decisions.
            </p>
          </Section>

          <Section title="Information we collect">
            <ul className="list-disc ml-5 space-y-1">
              <li><strong>Account data:</strong> email, and any name/phone/profile details you choose to add.</li>
              <li><strong>Usage data:</strong> searches, topics viewed, quizzes, and AI conversations, used to power your dashboard, learning progress, and product analytics.</li>
              <li><strong>Research content:</strong> learning prompts, gene or phenotype search terms, saved gene sets, and research-project notes you choose to provide. Do not include personal medical records, personal genomic files, or information that identifies a patient.</li>
              <li><strong>Billing data:</strong> handled by Stripe; we never see or store full card numbers.</li>
            </ul>
          </Section>

          <Section title="Publication-mode data boundary">
            <p>
              The public version of GeneMap does not offer personal medical-record upload, VCF analysis,
              diagnosis, individualized risk interpretation, pharmacogenomic recommendations, or medication
              dosing. Those paths are blocked in both the interface and API. If an earlier version of GeneMap
              stored information in your account, the public version does not use it for AI generation; contact
              us to request export or deletion.
            </p>
          </Section>

          <Section title="How your data is protected">
            <p>
              Authentication uses signed, HTTP-only cookies with CSRF protection, and production traffic is
              served over HTTPS. Access to account data is scoped to the signed-in user. No online service can
              guarantee absolute security, so avoid submitting sensitive personal information.
            </p>
          </Section>

          <Section title="AI processing & third parties">
            <p>
              Learning prompts and exploratory research queries may be sent to third-party large-language-model
              providers acting as our processors so GeneMap can return explanations, summaries, quizzes, and
              candidate research leads. Do not include personal health or genomic information in prompts.
              Payments are processed by Stripe. We do not sell personal data.
            </p>
          </Section>

          <Section title="Your choices & rights">
            <ul className="list-disc ml-5 space-y-1">
              <li>View and edit your profile at any time.</li>
              <li>Request export or deletion of your account and associated data by contacting us.</li>
              <li>Ask us to remove legacy records retained from an earlier version of the service.</li>
              <li>Opt out of the mailing list from your profile settings.</li>
            </ul>
          </Section>

          <Section title="Data retention">
            <p>
              We keep your data while your account is active. When you delete a record it is removed from
              the application; when you request account deletion we remove or anonymize your personal data,
              except where retention is legally required (e.g. billing records).
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

