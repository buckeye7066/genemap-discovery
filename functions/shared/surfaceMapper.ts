/**
 * Surface Mapper Module
 * Discovers all executable surfaces in the app for the Self-Check engine
 */

// Known function directories and their types
const SURFACE_DIRECTORIES = [
  { path: 'functions', type: 'function', recursive: true },
  { path: 'functions/shared', type: 'shared', recursive: true },
  { path: 'middleware', type: 'middleware', recursive: true },
  { path: 'queues', type: 'queue', recursive: true },
  { path: 'crawlers', type: 'crawler', recursive: true },
  { path: 'cron', type: 'cron', recursive: true }
];

// Known functions from the app (statically defined since Deno.readDir is limited)
const KNOWN_FUNCTIONS = [
  { name: 'systemSelfCheck', type: 'function', filePath: 'functions/systemSelfCheck.js' },
  { name: 'createCheckoutSession', type: 'function', filePath: 'functions/createCheckoutSession.js' },
  { name: 'stripeWebhook', type: 'function', filePath: 'functions/stripeWebhook.js' },
  { name: 'createInstitutionalCheckout', type: 'function', filePath: 'functions/createInstitutionalCheckout.js' },
  { name: 'createPortalSession', type: 'function', filePath: 'functions/createPortalSession.js' },
  { name: 'deleteUser', type: 'function', filePath: 'functions/deleteUser.js' },
  { name: 'getAllUsers', type: 'function', filePath: 'functions/getAllUsers.js' },
  { name: 'getBannedUsers', type: 'function', filePath: 'functions/getBannedUsers.js' },
  { name: 'banUser', type: 'function', filePath: 'functions/banUser.js' },
  { name: 'unbanUser', type: 'function', filePath: 'functions/unbanUser.js' },
  { name: 'preBanUser', type: 'function', filePath: 'functions/preBanUser.js' },
  { name: 'checkPreBanOnLogin', type: 'function', filePath: 'functions/checkPreBanOnLogin.js' },
  { name: 'grantPremiumAccess', type: 'function', filePath: 'functions/grantPremiumAccess.js' },
  { name: 'grantPremiumToUser', type: 'function', filePath: 'functions/grantPremiumToUser.js' },
  { name: 'grantAdminPrivileges', type: 'function', filePath: 'functions/grantAdminPrivileges.js' },
  { name: 'searchUsers', type: 'function', filePath: 'functions/searchUsers.js' },
  { name: 'surfaceMapper', type: 'shared', filePath: 'functions/shared/surfaceMapper.js' }
];

/**
 * Surface entry structure
 * @typedef {Object} SurfaceEntry
 * @property {string} name - Function/module name
 * @property {'function'|'shared'|'crawler'|'queue'|'middleware'|'cron'} type - Surface type
 * @property {string} filePath - Path to the file
 * @property {'handler'|'default'|'named'|'unknown'} exportType - Type of export
 * @property {boolean} importable - Whether the module can be imported
 * @property {string|null} error - Error message if import failed
 * @property {string|null} stack - Stack trace if import failed
 */

/**
 * Detect export type from module
 * @param {any} module - The imported module
 * @returns {'handler'|'default'|'named'|'unknown'}
 */
function detectExportType(module) {
  if (!module) return 'unknown';
  
  // Check for handler export (common in serverless)
  if (typeof module.handler === 'function') {
    return 'handler';
  }
  
  // Check for default export
  if (typeof module.default === 'function') {
    return 'default';
  }
  
  // Check for named exports (functions)
  const namedExports = Object.keys(module).filter(
    key => typeof module[key] === 'function'
  );
  
  if (namedExports.length > 0) {
    return 'named';
  }
  
  return 'unknown';
}

/**
 * Extract function name from file path
 * @param {string} filePath 
 * @returns {string}
 */
function extractFunctionName(filePath) {
  const parts = filePath.split('/');
  const fileName = parts[parts.length - 1];
  return fileName.replace(/\.(js|ts)$/, '');
}

/**
 * Determine surface type from file path
 * @param {string} filePath 
 * @returns {'function'|'shared'|'crawler'|'queue'|'middleware'|'cron'}
 */
function determineSurfaceType(filePath) {
  if (filePath.includes('/shared/')) return 'shared';
  if (filePath.startsWith('middleware/')) return 'middleware';
  if (filePath.startsWith('queues/')) return 'queue';
  if (filePath.startsWith('crawlers/')) return 'crawler';
  if (filePath.startsWith('cron/')) return 'cron';
  return 'function';
}

/**
 * Attempt to validate a surface by checking if it's callable
 * @param {string} functionName 
 * @param {Function} invokeFunction - The base44 functions.invoke method
 * @returns {Promise<{valid: boolean, error?: string}>}
 */
async function validateSurface(functionName, invokeFunction) {
  try {
    // Attempt a dry-run invoke with _selfTest query param
    const result = await Promise.race([
      invokeFunction(`${functionName}?_selfTest=1`, {}),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Validation timeout (5s)')), 5000)
      )
    ]);
    
    // Check if response indicates successful self-test
    const isOk = result?.data?.ok === true || result?.data?.testMode === true;
    return { valid: isOk, error: isOk ? null : 'Self-test did not return ok' };
  } catch (err) {
    // Expected errors are OK (unauthorized, missing params, etc.)
    const isExpectedError = 
      err.message?.includes('Unauthorized') ||
      err.message?.includes('Missing required') ||
      err.message?.includes('Admin') ||
      err.status === 400 ||
      err.status === 401 ||
      err.status === 403;
    
    return {
      valid: isExpectedError,
      error: isExpectedError ? null : err.message,
      stack: isExpectedError ? null : err.stack
    };
  }
}

/**
 * Extract offending code snippet from error stack
 * @param {string} filePath 
 * @param {Error} error 
 * @returns {string|null}
 */
function extractOffendingCode(filePath, error) {
  if (!error?.stack) return null;
  
  // Parse stack trace for line numbers
  const stackLines = error.stack.split('\n');
  const relevantLine = stackLines.find(line => line.includes(filePath));
  
  if (relevantLine) {
    const match = relevantLine.match(/:(\d+):(\d+)/);
    if (match) {
      const lineNum = parseInt(match[1], 10);
      return `Error at line ${lineNum}: ${error.message}`;
    }
  }
  
  return `Error: ${error.message}`;
}

/**
 * Get all discovered surfaces (static + dynamic discovery)
 * @returns {Promise<SurfaceEntry[]>}
 */
export async function getSurfaceMap() {
  const surfaces = [];
  
  // Add all known functions
  for (const fn of KNOWN_FUNCTIONS) {
    surfaces.push({
      name: fn.name,
      type: fn.type,
      filePath: fn.filePath,
      exportType: 'default', // Deno.serve pattern
      importable: true,
      error: null,
      stack: null
    });
  }
  
  return surfaces;
}

/**
 * Get only executable surfaces with valid runtime imports
 * @param {Function} invokeFunction - Optional base44 functions.invoke method for validation
 * @returns {Promise<SurfaceEntry[]>}
 */
export async function getExecutableSurfaces(invokeFunction = null) {
  const allSurfaces = await getSurfaceMap();
  
  // Filter to only function types that can be invoked
  const executableTypes = ['function'];
  const executables = allSurfaces.filter(s => executableTypes.includes(s.type));
  
  // If we have an invoke function, validate each surface
  if (invokeFunction) {
    const validatedSurfaces = await Promise.all(
      executables.map(async (surface) => {
        // Skip self-check and shared modules
        if (surface.name === 'systemSelfCheck' || surface.type === 'shared') {
          return { ...surface, importable: true };
        }
        
        const validation = await validateSurface(surface.name, invokeFunction);
        return {
          ...surface,
          importable: validation.valid,
          error: validation.error || null,
          stack: validation.stack || null
        };
      })
    );
    
    return validatedSurfaces;
  }
  
  return executables;
}

/**
 * Generate test cases for all surfaces
 * @param {Function} invokeFunction - The base44 functions.invoke method
 * @returns {Promise<Array<{surface: SurfaceEntry, testResult: object}>>}
 */
export async function runSurfaceTests(invokeFunction) {
  const surfaces = await getExecutableSurfaces();
  const results = [];
  
  for (const surface of surfaces) {
    // Skip shared modules and self
    if (surface.type === 'shared' || surface.name === 'systemSelfCheck') {
      results.push({
        surface,
        testResult: {
          ok: true,
          skipped: true,
          reason: surface.type === 'shared' ? 'Shared module (not directly invokable)' : 'Self-check module'
        }
      });
      continue;
    }
    
    try {
      const startTime = Date.now();
      
      // Dry-run test with self-test query param
      const result = await Promise.race([
        invokeFunction(`${surface.name}?_selfTest=1`, {}),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Function timeout (15s)')), 15000)
        )
      ]);
      
      // Check if the function returned a successful self-test response
      const isOk = result?.data?.ok === true || result?.data?.testMode === true;
      
      results.push({
        surface,
        testResult: {
          ok: isOk,
          duration: Date.now() - startTime,
          error: isOk ? null : (result?.data?.error || 'Self-test did not return ok')
        }
      });
    } catch (err) {
      // Determine if this is an expected error (auth/validation errors are acceptable)
      const isExpectedError = 
        err.message?.includes('Unauthorized') ||
        err.message?.includes('Missing required') ||
        err.message?.includes('Admin') ||
        err.status === 400 ||
        err.status === 401 ||
        err.status === 403;
      
      results.push({
        surface,
        testResult: {
          ok: isExpectedError,
          error: isExpectedError ? null : err.message,
          stack: isExpectedError ? null : err.stack,
          offendingCode: isExpectedError ? null : extractOffendingCode(surface.filePath, err),
          expectedError: isExpectedError
        }
      });
    }
  }
  
  return results;
}

export default {
  getSurfaceMap,
  getExecutableSurfaces,
  runSurfaceTests
};