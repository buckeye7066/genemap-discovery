import React from "react";
import { Link } from "react-router-dom";
import { FileText, ArrowLeft } from "lucide-react";

/**
 * Terms of Service. Standalone + reachable logged-in and logged-out
 * (registered in `openPages`). Emphasizes the single most important point for a
 * genetics/AI tool: it is for education and research, not medical advice.
 */
const UPDATED = "June 30, 2026";
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
              GeneMap provides <strong>educational and research</strong> information about genetics, including
              AI-generated explanations, gene/phenotype results, and analyses. It is <strong>not a substitute
              for professional medical advice, diagnosis, or treatment</strong>, and it is not a medical
              device. AI output (including gene coordinates, identifiers, and phenotype associations) can be
              incomplete or wrong and is not validated against authoritative genomic databases. Always consult
              a qualified healthcare provider or genetic counselor for medical decisions, and never disregard
              professional advice because of something you read here.
            </p>
          </Section>

          <Section title="Your account">
            <p>
              You are responsible for keeping your credentials secure and for activity under your account.
              Provide accurate information and notify us of any unauthorized use.
            </p>
          </Section>

          <Section title="Acceptable use">
            <ul className="list-disc ml-5 space-y-1">
              <li>Do not upload another person's medical or genetic data without their consent.</li>
              <li>Do not use the service for unlawful purposes or to attempt to breach its security.</li>
              <li>Do not misrepresent AI-generated content as validated clinical fact.</li>
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
              You retain ownership of content you upload. You grant us a limited license to process it solely
              to provide the service (including sending it to AI providers acting as our processors to return
              your results). See our <Link to="/privacypolicy" className="text-blue-600 hover:underline">Privacy Policy</Link>.
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
