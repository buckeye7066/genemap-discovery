import React from 'react';
import FriendlyPlaceholderPage from '../components/common/FriendlyPlaceholderPage.jsx';

export default function ExplorePage() {
  return (
    <FriendlyPlaceholderPage
      eyebrow="Explore genes and diseases"
      title="Explore trusted gene and disease information"
      description="This section will help you look up educational background about genes and related conditions in a clear way. It is for learning context, not for deciding what is happening in your body."
      bullets={[
        'Search and browse information written for everyday reading.',
        'See where information comes from when sources are available.',
        'Use what you learn to prepare better questions for a qualified professional if you have personal health concerns.',
      ]}
      primaryLink={{ label: 'See upload steps', route: '/upload' }}
      secondaryLink={{ label: 'Back home', route: '/' }}
    />
  );
}
