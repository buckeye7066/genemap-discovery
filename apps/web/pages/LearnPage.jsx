import React from 'react';
import FriendlyPlaceholderPage from '../components/common/FriendlyPlaceholderPage.jsx';

export default function LearnPage() {
  return (
    <FriendlyPlaceholderPage
      eyebrow="Learn genetics"
      title="Learn genetics in plain language"
      description="Start with simple explanations of DNA, genes, variants, and other common words you may see when reading about genetics. A variant means a difference in DNA wording; here, it is explained as background information only."
      bullets={[
        'Read short explanations without needing a science background.',
        'Understand common terms before looking at gene or disease information.',
        'Move at your own pace and come back to the home page anytime.',
      ]}
      primaryLink={{ label: 'Explore genes and diseases', route: '/explore' }}
      secondaryLink={{ label: 'Back home', route: '/' }}
    />
  );
}
