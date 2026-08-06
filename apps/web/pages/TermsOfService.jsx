import React from "react";
import { Link } from "react-router-dom";
import { FileText, ArrowLeft } from "lucide-react";

/**
 * Terms for the public education/research product. These terms mirror the
 * publication boundary enforced in both the web app and API.
 */
const UPDATED = "August 5, 2026";
const CONTACT = "support@axiombiolabs.org";

function Section({ title, children }) {
  return (
    <section className="mb-7">
      <h2 className="text-lg font-semibold text-slate-900 mb-2">{title}</h2>
      <div className="text-slate-700 leading-relaxed space-y-2 text-sm">{children}</div>
    </section>
  );
}

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
      <div className="max-w-3xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to GeneMap
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Terms of Service</h1>
        </div>
        <p className="text-sm text-slate-500 mb-8">Last updated: {UPDATED}</p>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8">
          <Section title="Acceptance">
            <p>By creating an account or using GeneMap, you agree to these Terms. If you do not agree, do not use the service.</p>
          </Section>

          <Section title="Educational use only — not medical advice">
            <p>
              GeneMap provides <strong>educational and exploratory-research</strong> information about genetics,
              including AI-generated explanations and candidate gene or phenotype leads. It is <strong>not a
              substitute for professional medical advice, diagnosis, or treatment</strong>, and it is not a
              medical device. AI rankings and explanations can be incomplete or wrong. Links to authoritative
              databases are starting points for independent verification, not claim-level citations. Always
              consult a qualified healthcare provider or genetic counselor for medical decisions, and never
              disregard professional advice because of something you read here.
            </p>
          </Section>

          <Section title="Your account">
            <p>
              You are responsible for keeping your credentials secure and for activity under your account.
              Provide accurate information and notify us of any unauthorized use.
            </p>
          </Section>

          <Section title="Publication boundary">
            <p>
              The published service does not accept personal medical records or genomic files for analysis and
              does not provide diagnosis, individualized risk interpretation, clinical decision support,
              pharmacogenomic recommendations, medication selection, or dosing. Do not try to use or bypass
              GeneMap for those purposes.
            </p>
          </Section>

          <Section title="Acceptable use">
            <ul className="list-disc ml-5 space-y-1">
              <li>Do not submit personal medical, genomic, or patient-identifying information.</li>
              <li>Do not use the service for unlawful purposes or attempt to breach or bypass its security.</li>
              <li>Do not misrepresent AI-generated content as validated scientific or clinical fact.</li>
            </ul>
          </Section>

          <Section title="Subscriptions & billing">
            <p>
              Paid plans are billed through Stripe on a recurring basis until canceled. You can manage or
              cancel your subscription from your account; access continues through the end of the paid period.
              Fees are non-refundable except where required by law.
            </p>
          </Section>

          <Section title="Your content">
            <p>
              You retain ownership of research prompts, notes, and other content you submit. You grant us a
              limited license to process it solely to provide the service, including sending relevant prompts
              to AI providers acting as our processors. You must have the right to submit that content, and you
              must not submit personal medical, genomic, or patient-identifying information. See our{" "}
              <Link to="/privacypolicy" className="text-blue-600 hover:underline">Privacy Policy</Link>.
            </p>
          </Section>

          <Section title="Disclaimers & limitation of liability">
            <p>
              The service is provided “as is” without warranties of any kind. To the maximum extent permitted
              by law, Axiom Biolabs is not liable for any indirect, incidental, or consequential damages, or
              for decisions made in reliance on AI-generated content.
            </p>
          </Section>

          <Section title="Changes & contact">
            <p>
              We may update these Terms; continued use after changes constitutes acceptance. Questions:{" "}
              <a className="text-blue-600 hover:underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.
            </p>
          </Section>

          <p className="text-xs text-slate-400 mt-6">
            These Terms are provided in good faith and are not legal advice. Have qualified counsel review
            them before relying on them for a commercial or regulated deployment.
          </p>
        </div>

        <p className="text-center text-sm text-slate-500 mt-6">
          See also our <Link to="/privacypolicy" className="text-blue-600 hover:underline">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  );
}

