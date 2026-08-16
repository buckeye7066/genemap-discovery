import React from "react";
import FriendlyPlaceholderPage from "../components/common/FriendlyPlaceholderPage.jsx";

export default function NotFoundPage() {
  return (
    <FriendlyPlaceholderPage
      eyebrow="Page not found"
      title="We could not find that page."
      description="The link may be old, or the page address may have been typed differently. Nothing is wrong with your data."
      details="Use the button below to return to the GeneMap Discovery home page and choose a clear next step."
      nextLabel="Go to home"
      nextRoute="/"
    />
  );
}
