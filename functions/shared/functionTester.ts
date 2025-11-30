/**
 * Function Tester v2.0
 * Executes and validates all mapped functions for the self-check system
 */

/**
 * @typedef {Object} FunctionTestResult
 * @property {boolean} ok - Whether the test passed
 * @property {string} filePath - Path to the function file
 * @property {string} functionName - Name of the function tested
 * @property {string} invokableName - Name used to invoke the function
 * @property {string} kind - Type of function (default/named/internal)
 * @property {string} category - Function category
 * @property {string|null} errorMessage - Error message if test failed
 * @property {string|null} stack - Stack trace if test failed
 * @property {string|null} snippet - Code snippet around failure point
 * @property {number} duration - Time taken for test in ms
 * @property {boolean} skipped - Whether the test was skipped
 * @property {string|null} skipReason - Reason for skipping
 */

// Timeout configurations by category
const TIMEOUT_CONFIG = {
  crawler: 15000,
  queue: 15000,
  cron: 15000,
  stripe: 10000,
  default: 5000
};

/**
 * Get appropriate timeout for a function based on its category
 * @param {string} category
 * @returns {number}
 */
function getTimeout(category) {
  return TIMEOUT_CONFIG[category] || TIMEOUT_CONFIG.default;
}

/**
 * Extract code snippet from error stack trace
 * @param {string} filePath
 * @param {Error} error
 * @returns {string|null}
 */
function extractSnippet(filePath, error) {
  if (!error?.stack) return null;
  
  const stackLines = error.stack.split('\n');
  const relevantLine = stackLines.find(line => 
    line.includes(filePath) || line.includes(filePath.replace('functions/', ''))
  );
  
  if (relevantLine) {
    const match = relevantLine.match(/:(\d+):(\d+)/);
    if (match) {
      const lineNum = parseInt(match[1], 10);
      return `Error near line ${lineNum}:\n${error.message}\n\nStack:\n${stackLines.slice(0, 5).join('\n')}`;
    }
  }
  
  return `${error.message}\n\nStack:\n${stackLines.slice(0, 5).join('\n')}`;
}

/**
 * Run a single function test
 * @param {object} surface - Function surface from mapper
 * @param {Function} invokeFunction - The base44 functions.invoke method
 * @returns {Promise<FunctionTestResult>}
 */
export async function runFunctionTest(surface, invokeFunction) {
  const startTime = Date.now();
  
  // Skip shared utilities - they're not directly invokable
  if (surface.filePath.includes('/shared/')) {
    return {
      ok: true,
      filePath: surface.filePath,
      functionName: surface.functionName,
      invokableName: surface.invokableName,
      kind: surface.kind,
      category: surface.category,
      errorMessage: null,
      stack: null,
      snippet: null,
      duration: Date.now() - startTime,
      skipped: true,
      skipReason: 'Shared utility module - not directly invokable'
    };
  }
  
  // Skip self-check to avoid recursion
  if (surface.invokableName === 'systemSelfCheck') {
    return {
      ok: true,
      filePath: surface.filePath,
      functionName: surface.functionName,
      invokableName: surface.invokableName,
      kind: surface.kind,
      category: surface.category,
      errorMessage: null,
      stack: null,
      snippet: null,
      duration: Date.now() - startTime,
      skipped: true,
      skipReason: 'Self-check module - skipped to avoid recursion'
    };
  }
  
  const timeout = getTimeout(surface.category);
  
  try {
    // Invoke with self-test flag in body
    const result = await Promise.race([
      invokeFunction(surface.invokableName, { _selfTest: true }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Function timeout (${timeout}ms)`)), timeout)
      )
    ]);
    
    // Check for successful self-test response
    const data = result?.data || result;
    const isOk = data?.ok === true || data?.testMode === true;
    
    return {
      ok: isOk,
      filePath: surface.filePath,
      functionName: surface.functionName,
      invokableName: surface.invokableName,
      kind: surface.kind,
      category: surface.category,
      errorMessage: isOk ? null : (data?.error || 'Self-test did not return ok'),
      stack: null,
      snippet: null,
      duration: Date.now() - startTime,
      skipped: false,
      skipReason: null
    };
    
  } catch (err) {
    // Determine if this is an expected/acceptable error
    const isExpectedError = 
      err.message?.includes('Unauthorized') ||
      err.message?.includes('Missing required') ||
      err.message?.includes('Admin') ||
      err.message?.includes('user_email') ||
      err.message?.includes('Missing') ||
      err.status === 400 ||
      err.status === 401 ||
      err.status === 403;
    
    // 400/401/403 errors are acceptable - they mean the function works but needs proper auth/params
    const isAcceptable = isExpectedError;
    
    return {
      ok: isAcceptable,
      filePath: surface.filePath,
      functionName: surface.functionName,
      invokableName: surface.invokableName,
      kind: surface.kind,
      category: surface.category,
      errorMessage: isAcceptable ? null : (err.message || 'Unknown error'),
      stack: isAcceptable ? null : err.stack,
      snippet: isAcceptable ? null : extractSnippet(surface.filePath, err),
      duration: Date.now() - startTime,
      skipped: false,
      skipReason: null,
      expectedError: isAcceptable ? err.message : null
    };
  }
}

/**
 * Run tests on all provided function surfaces
 * @param {Array} surfaces - Array of function surfaces from mapper
 * @param {Function} invokeFunction - The base44 functions.invoke method
 * @returns {Promise<FunctionTestResult[]>}
 */
export async function runAllFunctionTests(surfaces, invokeFunction) {
  const results = [];
  
  for (const surface of surfaces) {
    const result = await runFunctionTest(surface, invokeFunction);
    results.push(result);
  }
  
  return results;
}

/**
 * Generate consolidated error report from test results
 * @param {FunctionTestResult[]} results
 * @returns {string}
 */
export function generateErrorReport(results) {
  const failures = results.filter(r => !r.ok && !r.skipped);
  
  if (failures.length === 0) {
    return 'All function tests passed. No errors detected.';
  }
  
  const report = failures.map(f => `
--------------------------------------------------
FILE: ${f.filePath}
FUNCTION: ${f.functionName} (${f.kind})
INVOKABLE AS: ${f.invokableName}
CATEGORY: ${f.category}
OK: NO
ERROR: ${f.errorMessage ?? 'unknown'}
STACK:
${f.stack ?? 'no stack available'}

SNIPPET:
${f.snippet ?? 'no snippet available'}
--------------------------------------------------`).join('\n\n');

  return report;
}

export default {
  runFunctionTest,
  runAllFunctionTests,
  generateErrorReport
};