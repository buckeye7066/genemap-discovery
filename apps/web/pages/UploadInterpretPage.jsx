import React from 'react';
import FriendlyPlaceholderPage from '../components/common/FriendlyPlaceholderPage.jsx';

export default function UploadInterpretPage() {
  return (
    <FriendlyPlaceholderPage
      eyebrow="Upload and interpret my data"
      title="See the upload steps before choosing any file"
      description="Upload tools are not active on this page. This area explains the planned review sequence so you can understand what would happen before you decide whether to use a file."
      bullets={[
        'Preview the steps in a calm, privacy-first way.',
        'Learn what file checks and plain-language summaries may look like.',
        'Stay in control: nothing is uploaded from this placeholder page.',
      ]}
      primaryLink={{ label: 'Learn genetics first', route: '/learn' }}
      secondaryLink={{ label: 'Back home', route: '/' }}
    />
  );
}
