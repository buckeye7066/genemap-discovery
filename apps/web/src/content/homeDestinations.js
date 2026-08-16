/**
 * @typedef {Object} HomeDestination
 * @property {string} id
 * @property {string} title
 * @property {string} plainLanguageDescription
 * @property {string} route
 * @property {string} primaryActionLabel
 * @property {string} iconName
 * @property {boolean} isAvailableNow
 */

/** @type {HomeDestination[]} */
export const homeDestinations = [
  {
    id: "learn",
    title: "Learn genetics",
    plainLanguageDescription: "Start with simple explanations of genes, DNA, and common terms.",
    route: "/learn",
    primaryActionLabel: "Learn the basics",
    iconName: "book-open",
    isAvailableNow: true,
  },
  {
    id: "explore",
    title: "Explore genes & diseases",
    plainLanguageDescription: "Look through trusted information in a clear, educational way.",
    route: "/explore",
    primaryActionLabel: "Explore information",
    iconName: "search",
    isAvailableNow: true,
  },
  {
    id: "upload",
    title: "Upload & interpret my data",
    plainLanguageDescription: "See how the upload process will work before you choose any file.",
    route: "/upload",
    primaryActionLabel: "See upload steps",
    iconName: "upload-cloud",
    isAvailableNow: true,
  },
  {
    id: "trials",
    title: "Find matching trials",
    plainLanguageDescription: "Learn how research study information may be explored in the future.",
    route: "/trials",
    primaryActionLabel: "Learn about studies",
    iconName: "clipboard-list",
    isAvailableNow: true,
  },
];
