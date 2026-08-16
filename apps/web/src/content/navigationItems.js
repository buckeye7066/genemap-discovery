/**
 * @typedef {Object} NavigationItem
 * @property {string} label
 * @property {string} route
 * @property {string} ariaLabel
 * @property {boolean} isPrimary
 * @property {boolean} matchesHomeCard
 */

/** @type {NavigationItem[]} */
export const navigationItems = [
  {
    label: "Learn",
    route: "/learn",
    ariaLabel: "Learn genetics basics",
    isPrimary: false,
    matchesHomeCard: true,
  },
  {
    label: "Explore",
    route: "/explore",
    ariaLabel: "Explore trusted gene and disease information",
    isPrimary: false,
    matchesHomeCard: true,
  },
  {
    label: "Upload/Interpret",
    route: "/upload",
    ariaLabel: "Review the upload and interpretation preparation steps",
    isPrimary: true,
    matchesHomeCard: true,
  },
  {
    label: "Trials",
    route: "/trials",
    ariaLabel: "Learn about future research study information",
    isPrimary: false,
    matchesHomeCard: true,
  },
];
