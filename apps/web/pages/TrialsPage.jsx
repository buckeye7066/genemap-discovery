import React from 'react';
import FriendlyPlaceholderPage from '../components/common/FriendlyPlaceholderPage.jsx';

export default function TrialsPage() {
  return (
    <FriendlyPlaceholderPage
      eyebrow="Research studies"
      title="Learn how research study information may be explored"
      description="This section will explain research study information in plain language. It does not decide whether a study is right for you and does not replace speaking with a qualified professional or the study team."
      bullets={[
        'Learn what common research study words mean.',
        'Understand that study listings can have rules and limits.',
        'Use this as background reading only, not as instructions to join or avoid a study.',
      ]}
      primaryLink={{ label: 'Learn the basics', route: '/learn' }}
      secondaryLink={{ label: 'Back home', route: '/' }}
    />
  );
}
