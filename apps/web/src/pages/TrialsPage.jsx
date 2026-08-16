import React from "react";
import FriendlyPlaceholderPage from "../components/common/FriendlyPlaceholderPage.jsx";

export default function TrialsPage() {
  return (
    <FriendlyPlaceholderPage
      eyebrow="Find matching trials"
      title="Learn how research study information may be explored."
      description="This section will explain, in plain language, how public research study information may be organized and reviewed in the future."
      details="It will not tell you whether a study is right for you or what choice to make. For personal questions, use a qualified professional you trust."
      nextLabel="Return to learning"
      nextRoute="/learn"
    />
  );
}
