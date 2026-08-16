import React from "react";
import FriendlyPlaceholderPage from "../components/common/FriendlyPlaceholderPage.jsx";

export default function LearnPage() {
  return (
    <FriendlyPlaceholderPage
      eyebrow="Learn genetics"
      title="Start with simple genetics basics."
      description="This section will explain genes, DNA, variants, and common words in plain language, so you can explore without needing a science background."
      details="The content is educational only. It is not a diagnosis, personal risk estimate, treatment advice, medicine advice, or research-study guidance."
      nextLabel="Explore genes and diseases"
      nextRoute="/explore"
    />
  );
}
