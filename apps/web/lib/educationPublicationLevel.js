const PUBLICATION_LEVEL_BY_PROFILE_LEVEL = Object.freeze({
  elementary: 'elementary',
  middle_school: 'middle_school',
  high_school: 'high_school',
  undergraduate: 'undergraduate',
  graduate: 'graduate',
  postgraduate: 'postgraduate',
  // Legacy Profile.jsx values must resolve to one of the API's six levels.
  phd: 'graduate',
  medical: 'postgraduate',
  researcher: 'postgraduate',
});

export function normalizeEducationPublicationLevel(profileLevel) {
  return Object.prototype.hasOwnProperty.call(PUBLICATION_LEVEL_BY_PROFILE_LEVEL, profileLevel)
    ? PUBLICATION_LEVEL_BY_PROFILE_LEVEL[profileLevel]
    : 'undergraduate';
}
