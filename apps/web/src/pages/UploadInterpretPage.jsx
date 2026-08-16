import React from "react";
import FriendlyPlaceholderPage from "../components/common/FriendlyPlaceholderPage.jsx";

export default function UploadInterpretPage() {
  return (
    <FriendlyPlaceholderPage
      eyebrow="Upload & interpret my data"
      title="See the upload path before choosing any file."
      description="Upload tools are not active on this page yet. For now, you can review what the steps would look like and decide later whether you want to choose a file."
      details="Nothing is uploaded here, and no genetic file is processed from this placeholder. Any future review would be for learning and context only."
      nextLabel="Learn about studies"
      nextRoute="/trials"
    />
  );
}
