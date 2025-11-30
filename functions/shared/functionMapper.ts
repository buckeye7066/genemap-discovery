/**
 * Function Mapper v2.0
 * Maps ALL functions across the entire application for comprehensive self-check coverage
 */

// All known backend functions in this app (comprehensive list)
const KNOWN_FUNCTIONS = [
  // Core backend functions
  { filePath: 'functions/createCheckoutSession.js', functionName: 'default', kind: 'default', exported: true },
  { filePath: 'functions/stripeWebhook.js', functionName: 'default', kind: 'default', exported: true },
  { filePath: 'functions/createInstitutionalCheckout.js', functionName: 'default', kind: 'default', exported: true },
  { filePath: 'functions/createPortalSession.js', functionName: 'default', kind: 'default', exported: true },
  
  // User management functions
  { filePath: 'functions/deleteUser.js', functionName: 'default', kind: 'default', exported: true },
  { filePath: 'functions/getAllUsers.js', functionName: 'default', kind: 'default', exported: true },
  { filePath: 'functions/getBannedUsers.js', functionName: 'default', kind: 'default', exported: true },
  { filePath: 'functions/banUser.js', functionName: 'default', kind: 'default', exported: true },
  { filePath: 'functions/unbanUser.js', functionName: 'default', kind: 'default', exported: true },
  { filePath: 'functions/preBanUser.js', functionName: 'default', kind: 'default', exported: true },
  { filePath: 'functions/checkPreBanOnLogin.js', functionName: 'default', kind: 'default', exported: true },
  { filePath: 'functions/searchUsers.js', functionName: 'default', kind: 'default', exported: true },
  
  // Admin privilege functions
  { filePath: 'functions/grantPremiumAccess.js', functionName: 'default', kind: 'default', exported: true },
  { filePath: 'functions/grantPremiumToUser.js', functionName: 'default', kind: 'default', exported: true },
  { filePath: 'functions/grantAdminPrivileges.js', functionName: 'default', kind: 'default', exported: true },
  
  // Shared utilities
  { filePath: 'functions/shared/functionMapper.js', functionName: 'mapAllFunctions', kind: 'named', exported: true },
  { filePath: 'functions/shared/functionTester.js', functionName: 'runFunctionTest', kind: 'named', exported: true },
  { filePath: 'functions/shared/functionTester.js', functionName: 'runAllFunctionTests', kind: 'named', exported: true },
];

/**
 * @typedef {Object} FunctionSurface
 * @property {string} filePath - Path to the file containing the function
 * @property {string} functionName - Name of the function (or 'default' for default exports)
 * @property {'default'|'named'|'internal'} kind - Type of export/function
 * @property {boolean} exported - Whether the function is exported
 * @property {string} [category] - Logical category (stripe, user, admin, etc.)
 */

/**
 * Extract the invokable function name from a file path
 * @param {string} filePath
 * @returns {string}
 */
function extractInvokableName(filePath) {
  const parts = filePath.split('/');
  const fileName = parts[parts.length - 1];
  return fileName.replace(/\.(js|ts)$/, '');
}

/**
 * Categorize a function based on its file path or name
 * @param {string} filePath
 * @param {string} functionName
 * @returns {string}
 */
function categorizeFunction(filePath, functionName) {
  const name = extractInvokableName(filePath).toLowerCase();
  
  if (name.includes('stripe') || name.includes('checkout') || name.includes('portal')) {
    return 'stripe';
  }
  if (name.includes('user') || name.includes('ban') || name.includes('premium') || name.includes('admin')) {
    return 'user_management';
  }
  if (filePath.includes('/shared/')) {
    return 'shared_utility';
  }
  if (name.includes('crawler') || name.includes('crawl')) {
    return 'crawler';
  }
  if (name.includes('queue') || name.includes('job')) {
    return 'queue';
  }
  if (name.includes('cron') || name.includes('scheduled')) {
    return 'cron';
  }
  
  return 'backend_function';
}

/**
 * Map all functions in the application
 * @returns {Promise<FunctionSurface[]>}
 */
export async function mapAllFunctions() {
  const surfaces = [];
  
  for (const fn of KNOWN_FUNCTIONS) {
    const invokableName = extractInvokableName(fn.filePath);
    const category = categorizeFunction(fn.filePath, fn.functionName);
    
    surfaces.push({
      filePath: fn.filePath,
      functionName: fn.functionName,
      invokableName,
      kind: fn.kind,
      exported: fn.exported,
      category
    });
  }
  
  return surfaces;
}

/**
 * Get only invokable backend functions (excludes shared utilities)
 * @returns {Promise<FunctionSurface[]>}
 */
export async function getInvokableFunctions() {
  const all = await mapAllFunctions();
  return all.filter(fn => 
    !fn.filePath.includes('/shared/') && 
    fn.kind === 'default' &&
    fn.exported
  );
}

/**
 * Get functions by category
 * @param {string} category
 * @returns {Promise<FunctionSurface[]>}
 */
export async function getFunctionsByCategory(category) {
  const all = await mapAllFunctions();
  return all.filter(fn => fn.category === category);
}

export default {
  mapAllFunctions,
  getInvokableFunctions,
  getFunctionsByCategory
};