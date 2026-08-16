/**
 * @typedef {Object} EmptyDataState
 * @property {string} headline
 * @property {string} message
 * @property {string} primaryActionLabel
 * @property {string} primaryActionRoute
 * @property {string} privacyReassurance
 */

/** @type {EmptyDataState} */
export const emptyDataState = {
  headline: "You haven't uploaded anything yet — here's how to begin.",
  message: "Start by learning what the upload process looks like. You can decide later whether you want to choose a file.",
  primaryActionLabel: "See upload steps",
  primaryActionRoute: "/upload",
  privacyReassurance: "No genetic data is on this page, and nothing is sent anywhere from the home screen.",
};
