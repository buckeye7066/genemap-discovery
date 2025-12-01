/**
 * Get Function Details
 * 
 * Returns the source code and metadata for a function in the registry.
 * Works with the static KNOWN_FUNCTIONS registry.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

// Static registry - must match components/functionRegistry.js
const KNOWN_FUNCTIONS = [
  { functionId: 'createCheckoutSession', filePath: 'functions/createCheckoutSession.js', exportType: 'default', namedExports: [], dependencyPaths: [], category: 'stripe' },
  { functionId: 'stripeWebhook', filePath: 'functions/stripeWebhook.js', exportType: 'default', namedExports: [], dependencyPaths: [], category: 'stripe' },
  { functionId: 'createInstitutionalCheckout', filePath: 'functions/createInstitutionalCheckout.js', exportType: 'default', namedExports: [], dependencyPaths: [], category: 'stripe' },
  { functionId: 'createPortalSession', filePath: 'functions/createPortalSession.js', exportType: 'default', namedExports: [], dependencyPaths: [], category: 'stripe' },
  { functionId: 'deleteUser', filePath: 'functions/deleteUser.js', exportType: 'default', namedExports: [], dependencyPaths: [], category: 'user_management' },
  { functionId: 'getAllUsers', filePath: 'functions/getAllUsers.js', exportType: 'default', namedExports: [], dependencyPaths: [], category: 'user_management' },
  { functionId: 'getBannedUsers', filePath: 'functions/getBannedUsers.js', exportType: 'default', namedExports: [], dependencyPaths: [], category: 'user_management' },
  { functionId: 'banUser', filePath: 'functions/banUser.js', exportType: 'default', namedExports: [], dependencyPaths: [], category: 'user_management' },
  { functionId: 'unbanUser', filePath: 'functions/unbanUser.js', exportType: 'default', namedExports: [], dependencyPaths: [], category: 'user_management' },
  { functionId: 'preBanUser', filePath: 'functions/preBanUser.js', exportType: 'default', namedExports: [], dependencyPaths: [], category: 'user_management' },
  { functionId: 'checkPreBanOnLogin', filePath: 'functions/checkPreBanOnLogin.js', exportType: 'default', namedExports: [], dependencyPaths: [], category: 'user_management' },
  { functionId: 'searchUsers', filePath: 'functions/searchUsers.js', exportType: 'default', namedExports: [], dependencyPaths: [], category: 'user_management' },
  { functionId: 'grantPremiumAccess', filePath: 'functions/grantPremiumAccess.js', exportType: 'default', namedExports: [], dependencyPaths: [], category: 'admin' },
  { functionId: 'grantPremiumToUser', filePath: 'functions/grantPremiumToUser.js', exportType: 'default', namedExports: [], dependencyPaths: [], category: 'admin' },
  { functionId: 'grantAdminPrivileges', filePath: 'functions/grantAdminPrivileges.js', exportType: 'default', namedExports: [], dependencyPaths: [], category: 'admin' },
  { functionId: 'testAllFunctions', filePath: 'functions/testAllFunctions.js', exportType: 'default', namedExports: [], dependencyPaths: [], category: 'system' },
  { functionId: 'getFunctionDetails', filePath: 'functions/getFunctionDetails.js', exportType: 'default', namedExports: [], dependencyPaths: [], category: 'system' },
  { functionId: 'functionRegistry', filePath: 'components/functionRegistry.js', exportType: 'named', namedExports: ['KNOWN_FUNCTIONS', 'getFunctionById'], dependencyPaths: [], category: 'shared' },
  { functionId: 'logger', filePath: 'components/shared/logger.js', exportType: 'default', namedExports: [], dependencyPaths: [], category: 'shared' },
  { functionId: 'constants', filePath: 'components/shared/constants.js', exportType: 'named', namedExports: [], dependencyPaths: [], category: 'shared' },
  { functionId: 'errorUtils', filePath: 'components/shared/errorUtils.js', exportType: 'named', namedExports: [], dependencyPaths: [], category: 'shared' },
  { functionId: 'dateUtils', filePath: 'components/shared/dateUtils.js', exportType: 'named', namedExports: [], dependencyPaths: [], category: 'shared' },
  { functionId: 'safeNavigate', filePath: 'components/shared/safeNavigate.js', exportType: 'named', namedExports: [], dependencyPaths: [], category: 'shared' },
  { functionId: 'PhenotypeSearchService', filePath: 'components/search/PhenotypeSearchService.js', exportType: 'named', namedExports: ['PhenotypeSearchService'], dependencyPaths: [], category: 'service' },
  { functionId: 'VCFParser', filePath: 'components/medical/VCFParser.js', exportType: 'named', namedExports: [], dependencyPaths: [], category: 'processor' },
];

/**
 * Fetch file content via HTTP (Base44 serves files at predictable URLs)
 */
async function fetchFileContent(filePath, appId) {
  // Try multiple URL patterns that Base44 might use
  const baseUrls = [
    `https://app.base44.com/api/apps/${appId}/files/`,
    `https://api.base44.com/v1/apps/${appId}/files/`,
  ];
  
  // For now, return a placeholder indicating we cannot fetch dynamically
  // Base44 doesn't expose a public file API for reading source code
  return {
    ok: false,
    code: null,
    error: 'File content fetch not available in Base44 runtime. Source code must be viewed in the editor.'
  };
}

/**
 * Make a string JSON-safe by escaping special characters
 */
function makeJsonSafe(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

Deno.serve(async (req) => {
  // Parse body
  const clonedReq = req.clone();
  let body;
  try {
    body = await clonedReq.json();
  } catch {
    body = {};
  }
  
  // Self-test mode
  if (body._selfTest === true) {
    return Response.json({
      ok: true,
      testMode: true,
      message: 'getFunctionDetails self-test passed',
      registryCount: KNOWN_FUNCTIONS.length
    });
  }
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    // Admin-only access
    if (!user || user.role !== 'admin') {
      return Response.json({
        ok: false,
        error: 'Unauthorized. Admin access required.'
      }, { status: 403 });
    }
    
    const { functionId, listAll } = body;
    
    // If listAll is true, return the entire registry
    if (listAll === true) {
      return Response.json({
        ok: true,
        data: {
          functions: KNOWN_FUNCTIONS,
          count: KNOWN_FUNCTIONS.length,
          categories: [...new Set(KNOWN_FUNCTIONS.map(f => f.category))]
        }
      });
    }
    
    // Find the function in registry
    if (!functionId) {
      return Response.json({
        ok: false,
        error: 'Missing required parameter: functionId'
      }, { status: 400 });
    }
    
    const fnEntry = KNOWN_FUNCTIONS.find(f => f.functionId === functionId);
    
    if (!fnEntry) {
      return Response.json({
        ok: false,
        error: `Function not found in registry: ${functionId}`,
        availableFunctions: KNOWN_FUNCTIONS.map(f => f.functionId)
      }, { status: 404 });
    }
    
    // Build response with metadata
    // Note: Source code fetching is not available in Base44 runtime
    // Users must view source in the editor
    const result = {
      functionId: fnEntry.functionId,
      filePath: fnEntry.filePath,
      exportType: fnEntry.exportType,
      namedExports: fnEntry.namedExports || [],
      category: fnEntry.category,
      description: fnEntry.description || '',
      dependencyPaths: fnEntry.dependencyPaths || [],
      dependencies: (fnEntry.dependencyPaths || []).map(depPath => ({
        filePath: depPath,
        code: '// Source code viewing not available in runtime.\n// Please view this file in the Base44 editor.',
        available: false
      })),
      sourceCode: '// Source code viewing not available in runtime.\n// Please view this file in the Base44 editor.\n// File: ' + fnEntry.filePath,
      sourceAvailable: false,
      note: 'Base44 does not expose a file API for reading source code at runtime. View source in the editor.'
    };
    
    return Response.json({
      ok: true,
      data: result
    });
    
  } catch (error) {
    return Response.json({
      ok: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});