import React from "react";
import FriendlyPlaceholderPage from "../components/common/FriendlyPlaceholderPage.jsx";

export default function ExplorePage() {
  return (
    <FriendlyPlaceholderPage
      eyebrow="Explore genes & diseases"
      title="Explore trusted background information."
      description="This section will help you look through gene and disease information in a clear, educational way, with plain explanations and source context."
      details="You can use it to learn what terms mean. It does not tell you what condition you have, what may happen to you, or what action to take."
      nextLabel="See upload steps"
      nextRoute="/upload"
    />
  );
}
