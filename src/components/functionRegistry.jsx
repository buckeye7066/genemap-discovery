/**
 * KNOWN_FUNCTIONS - Static Function Registry
 * 
 * This registry lists ALL backend functions and modules in this app.
 * Must be manually maintained when adding/removing functions.
 * 
 * Copy this file to any Base44 app and update the entries.
 */

export const KNOWN_FUNCTIONS = [
  // ============================================
  // STRIPE / BILLING FUNCTIONS
  // ============================================
  {
    functionId: 'createCheckoutSession',
    filePath: 'functions/createCheckoutSession.js',
    exportType: 'default',
    namedExports: [],
    dependencyPaths: [],
    category: 'stripe',
    description: 'Creates Stripe checkout session for subscriptions'
  },
  {
    functionId: 'stripeWebhook',
    filePath: 'functions/stripeWebhook.js',
    exportType: 'default',
    namedExports: [],
    dependencyPaths: [],
    category: 'stripe',
    description: 'Handles Stripe webhook events'
  },
  {
    functionId: 'createInstitutionalCheckout',
    filePath: 'functions/createInstitutionalCheckout.js',
    exportType: 'default',
    namedExports: [],
    dependencyPaths: [],
    category: 'stripe',
    description: 'Creates checkout for institutional licenses'
  },
  {
    functionId: 'createPortalSession',
    filePath: 'functions/createPortalSession.js',
    exportType: 'default',
    namedExports: [],
    dependencyPaths: [],
    category: 'stripe',
    description: 'Creates Stripe customer portal session'
  },

  // ============================================
  // USER MANAGEMENT FUNCTIONS
  // ============================================
  {
    functionId: 'deleteUser',
    filePath: 'functions/deleteUser.js',
    exportType: 'default',
    namedExports: [],
    dependencyPaths: [],
    category: 'user_management',
    description: 'Deletes a user and their data'
  },
  {
    functionId: 'getAllUsers',
    filePath: 'functions/getAllUsers.js',
    exportType: 'default',
    namedExports: [],
    dependencyPaths: [],
    category: 'user_management',
    description: 'Fetches all users (admin only)'
  },
  {
    functionId: 'getBannedUsers',
    filePath: 'functions/getBannedUsers.js',
    exportType: 'default',
    namedExports: [],
    dependencyPaths: [],
    category: 'user_management',
    description: 'Fetches banned and pre-banned users'
  },
  {
    functionId: 'banUser',
    filePath: 'functions/banUser.js',
    exportType: 'default',
    namedExports: [],
    dependencyPaths: [],
    category: 'user_management',
    description: 'Bans a user'
  },
  {
    functionId: 'unbanUser',
    filePath: 'functions/unbanUser.js',
    exportType: 'default',
    namedExports: [],
    dependencyPaths: [],
    category: 'user_management',
    description: 'Unbans a user'
  },
  {
    functionId: 'preBanUser',
    filePath: 'functions/preBanUser.js',
    exportType: 'default',
    namedExports: [],
    dependencyPaths: [],
    category: 'user_management',
    description: 'Pre-bans a user before registration'
  },
  {
    functionId: 'checkPreBanOnLogin',
    filePath: 'functions/checkPreBanOnLogin.js',
    exportType: 'default',
    namedExports: [],
    dependencyPaths: [],
    category: 'user_management',
    description: 'Checks if user matches pre-ban records'
  },
  {
    functionId: 'searchUsers',
    filePath: 'functions/searchUsers.js',
    exportType: 'default',
    namedExports: [],
    dependencyPaths: [],
    category: 'user_management',
    description: 'Searches users by email/name/phone'
  },

  // ============================================
  // ADMIN FUNCTIONS
  // ============================================
  {
    functionId: 'grantPremiumAccess',
    filePath: 'functions/grantPremiumAccess.js',
    exportType: 'default',
    namedExports: [],
    dependencyPaths: [],
    category: 'admin',
    description: 'Grants premium to current user'
  },
  {
    functionId: 'grantPremiumToUser',
    filePath: 'functions/grantPremiumToUser.js',
    exportType: 'default',
    namedExports: [],
    dependencyPaths: [],
    category: 'admin',
    description: 'Grants premium to specific user'
  },
  {
    functionId: 'grantAdminPrivileges',
    filePath: 'functions/grantAdminPrivileges.js',
    exportType: 'default',
    namedExports: [],
    dependencyPaths: [],
    category: 'admin',
    description: 'Grants admin privileges to user'
  },

  // ============================================
  // SYSTEM FUNCTIONS
  // ============================================
  {
    functionId: 'testAllFunctions',
    filePath: 'functions/testAllFunctions.js',
    exportType: 'default',
    namedExports: [],
    dependencyPaths: ['components/functionRegistry.js'],
    category: 'system',
    description: 'Tests all backend functions'
  },
  {
    functionId: 'getFunctionDetails',
    filePath: 'functions/getFunctionDetails.js',
    exportType: 'default',
    namedExports: [],
    dependencyPaths: ['components/functionRegistry.js'],
    category: 'system',
    description: 'Returns function source code and metadata'
  },

  // ============================================
  // SHARED UTILITIES / HELPERS
  // ============================================
  {
    functionId: 'functionRegistry',
    filePath: 'components/functionRegistry.js',
    exportType: 'named',
    namedExports: ['KNOWN_FUNCTIONS', 'getFunctionById', 'getFunctionsByCategory', 'getAllCategories'],
    dependencyPaths: [],
    category: 'shared',
    description: 'Static registry of all functions'
  },
  {
    functionId: 'logger',
    filePath: 'components/shared/logger.js',
    exportType: 'default',
    namedExports: ['info', 'warn', 'error', 'debug'],
    dependencyPaths: [],
    category: 'shared',
    description: 'Environment-aware logging utility'
  },
  {
    functionId: 'constants',
    filePath: 'components/shared/constants.js',
    exportType: 'named',
    namedExports: [],
    dependencyPaths: [],
    category: 'shared',
    description: 'Application constants'
  },
  {
    functionId: 'errorUtils',
    filePath: 'components/shared/errorUtils.js',
    exportType: 'named',
    namedExports: [],
    dependencyPaths: [],
    category: 'shared',
    description: 'Error handling utilities'
  },
  {
    functionId: 'dateUtils',
    filePath: 'components/shared/dateUtils.js',
    exportType: 'named',
    namedExports: [],
    dependencyPaths: [],
    category: 'shared',
    description: 'Date formatting utilities'
  },
  {
    functionId: 'safeNavigate',
    filePath: 'components/shared/safeNavigate.js',
    exportType: 'named',
    namedExports: ['getBrowserEnvironment', 'safeNavigate'],
    dependencyPaths: [],
    category: 'shared',
    description: 'Cross-platform navigation utilities'
  },

  // ============================================
  // SEARCH / PHENOTYPE SERVICES
  // ============================================
  {
    functionId: 'PhenotypeSearchService',
    filePath: 'components/search/PhenotypeSearchService.js',
    exportType: 'named',
    namedExports: ['PhenotypeSearchService'],
    dependencyPaths: [],
    category: 'service',
    description: 'Phenotype to gene search service'
  },

  // ============================================
  // MEDICAL / VCF PROCESSING
  // ============================================
  {
    functionId: 'VCFParser',
    filePath: 'components/medical/VCFParser.js',
    exportType: 'named',
    namedExports: [],
    dependencyPaths: [],
    category: 'processor',
    description: 'VCF file parser'
  },
];

/**
 * Get function by ID
 */
export function getFunctionById(functionId) {
  return KNOWN_FUNCTIONS.find(f => f.functionId === functionId) || null;
}

/**
 * Get all functions in a category
 */
export function getFunctionsByCategory(category) {
  return KNOWN_FUNCTIONS.filter(f => f.category === category);
}

/**
 * Get all unique categories
 */
export function getAllCategories() {
  return [...new Set(KNOWN_FUNCTIONS.map(f => f.category))];
}

/**
 * Get function count
 */
export function getFunctionCount() {
  return KNOWN_FUNCTIONS.length;
}

export default KNOWN_FUNCTIONS;