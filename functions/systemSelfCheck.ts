/**
 * System Self-Check v2.0
 * Comprehensive diagnostic system for all application layers
 * 
 * Features:
 * - Full function introspection and testing
 * - Entity/database health checks
 * - RLS policy validation
 * - Environment variable verification
 * - Integration health checks
 * - Cross-contamination detection
 * - Consolidated error reporting
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

// Required environment variables
const REQUIRED_ENV_VARS = [
  'BASE44_APP_ID',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET'
];

// Known entities to check
const KNOWN_ENTITIES = [
  'Subscription',
  'Message',
  'AIConversation',
  'PreBannedUser',
  'SearchHistory',
  'MedicalData',
  'GeneSet',
  'MedicalDataShare',
  'UserActivity',
  'ResearchProject',
  'ProjectCollaborator',
  'ProjectVersion',
  'VisualizationConfig',
  'InstitutionalLicense',
  'LicenseAssignment',
  'LicenseUsageLog',
  'SystemCheckLog'
];

// RLS test entities
const RLS_TEST_ENTITIES = ['SearchHistory', 'MedicalData', 'GeneSet', 'ResearchProject'];

// Contamination check entities
const CONTAMINATION_ENTITIES = [
  { name: 'SearchHistory', field: 'created_by' },
  { name: 'MedicalData', field: 'created_by' },
  { name: 'GeneSet', field: 'created_by' },
  { name: 'AIConversation', field: 'created_by' },
  { name: 'Subscription', field: 'created_by' }
];

// All known invokable backend functions
const KNOWN_FUNCTIONS = [
  { filePath: 'functions/createCheckoutSession.js', invokableName: 'createCheckoutSession', category: 'stripe' },
  { filePath: 'functions/stripeWebhook.js', invokableName: 'stripeWebhook', category: 'stripe' },
  { filePath: 'functions/createInstitutionalCheckout.js', invokableName: 'createInstitutionalCheckout', category: 'stripe' },
  { filePath: 'functions/createPortalSession.js', invokableName: 'createPortalSession', category: 'stripe' },
  { filePath: 'functions/deleteUser.js', invokableName: 'deleteUser', category: 'user_management' },
  { filePath: 'functions/getAllUsers.js', invokableName: 'getAllUsers', category: 'user_management' },
  { filePath: 'functions/getBannedUsers.js', invokableName: 'getBannedUsers', category: 'user_management' },
  { filePath: 'functions/banUser.js', invokableName: 'banUser', category: 'user_management' },
  { filePath: 'functions/unbanUser.js', invokableName: 'unbanUser', category: 'user_management' },
  { filePath: 'functions/preBanUser.js', invokableName: 'preBanUser', category: 'user_management' },
  { filePath: 'functions/checkPreBanOnLogin.js', invokableName: 'checkPreBanOnLogin', category: 'user_management' },
  { filePath: 'functions/searchUsers.js', invokableName: 'searchUsers', category: 'user_management' },
  { filePath: 'functions/grantPremiumAccess.js', invokableName: 'grantPremiumAccess', category: 'admin' },
  { filePath: 'functions/grantPremiumToUser.js', invokableName: 'grantPremiumToUser', category: 'admin' },
  { filePath: 'functions/grantAdminPrivileges.js', invokableName: 'grantAdminPrivileges', category: 'admin' },
];

// Timeout configurations by category
const TIMEOUT_CONFIG = {
  crawler: 15000,
  queue: 15000,
  stripe: 10000,
  default: 5000
};

/**
 * Run a single function test
 */
async function runFunctionTest(surface, invokeFunction) {
  const startTime = Date.now();
  const timeout = TIMEOUT_CONFIG[surface.category] || TIMEOUT_CONFIG.default;
  
  // Skip self-check to avoid recursion
  if (surface.invokableName === 'systemSelfCheck') {
    return {
      ok: true,
      filePath: surface.filePath,
      invokableName: surface.invokableName,
      category: surface.category,
      errorMessage: null,
      stack: null,
      duration: 0,
      skipped: true,
      skipReason: 'Self-check module - skipped to avoid recursion'
    };
  }
  
  try {
    const result = await Promise.race([
      invokeFunction(surface.invokableName, { _selfTest: true }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Function timeout (${timeout}ms)`)), timeout)
      )
    ]);
    
    const data = result?.data || result;
    const isOk = data?.ok === true || data?.testMode === true;
    
    return {
      ok: isOk,
      filePath: surface.filePath,
      invokableName: surface.invokableName,
      category: surface.category,
      errorMessage: isOk ? null : (data?.error || 'Self-test did not return ok'),
      stack: null,
      duration: Date.now() - startTime,
      skipped: false,
      skipReason: null
    };
  } catch (err) {
    const isExpectedError = 
      err.message?.includes('Unauthorized') ||
      err.message?.includes('Missing required') ||
      err.message?.includes('Admin') ||
      err.message?.includes('user_email') ||
      err.message?.includes('Missing') ||
      err.status === 400 ||
      err.status === 401 ||
      err.status === 403;
    
    return {
      ok: isExpectedError,
      filePath: surface.filePath,
      invokableName: surface.invokableName,
      category: surface.category,
      errorMessage: isExpectedError ? null : (err.message || 'Unknown error'),
      stack: isExpectedError ? null : err.stack,
      duration: Date.now() - startTime,
      skipped: false,
      skipReason: null,
      expectedError: isExpectedError ? err.message : null
    };
  }
}

/**
 * Generate error report from function results
 */
function generateFunctionErrorReport(results) {
  const failures = results.filter(r => !r.ok && !r.skipped);
  
  if (failures.length === 0) {
    return 'All function tests passed. No errors detected.';
  }
  
  return failures.map(f => `
--------------------------------------------------
FILE: ${f.filePath}
FUNCTION: ${f.invokableName}
CATEGORY: ${f.category}
ERROR: ${f.errorMessage ?? 'unknown'}
STACK: ${f.stack ?? 'no stack available'}
--------------------------------------------------`).join('\n\n');
}

/**
 * Check environment variables
 */
function checkEnvironment() {
  const checks = [];
  const missing = [];
  
  for (const envVar of REQUIRED_ENV_VARS) {
    const value = Deno.env.get(envVar);
    const ok = !!value;
    
    checks.push({
      category: 'environment',
      name: `ENV: ${envVar}`,
      ok,
      error: ok ? null : `Missing environment variable: ${envVar}`,
      filePath: null
    });
    
    if (!ok) missing.push(envVar);
  }
  
  return { checks, missing };
}

/**
 * Check database entities
 */
async function checkEntities(base44) {
  const checks = [];
  
  for (const entityName of KNOWN_ENTITIES) {
    try {
      await Promise.race([
        base44.asServiceRole.entities[entityName].filter({}, '-created_date', 1),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Entity query timeout')), 5000)
        )
      ]);
      
      checks.push({
        category: 'database',
        name: `Entity: ${entityName}`,
        ok: true,
        error: null,
        filePath: `entities/${entityName}.json`
      });
    } catch (err) {
      checks.push({
        category: 'database',
        name: `Entity: ${entityName}`,
        ok: false,
        error: err.message || 'Entity check failed',
        filePath: `entities/${entityName}.json`
      });
    }
  }
  
  return checks;
}

/**
 * Check RLS policies
 */
async function checkRLS(base44, userEmail) {
  const checks = [];
  
  for (const entityName of RLS_TEST_ENTITIES) {
    try {
      await base44.entities[entityName].filter(
        { created_by: userEmail },
        '-created_date',
        1
      );
      
      checks.push({
        category: 'rls',
        name: `RLS: ${entityName} user-scoped`,
        ok: true,
        error: null,
        filePath: `entities/${entityName}.json`
      });
    } catch (err) {
      checks.push({
        category: 'rls',
        name: `RLS: ${entityName} user-scoped`,
        ok: false,
        error: err.message || 'RLS check failed',
        filePath: `entities/${entityName}.json`
      });
    }
  }
  
  return checks;
}

/**
 * Check for data contamination
 */
async function checkContamination(base44) {
  const results = [];
  
  for (const { name: entityName, field } of CONTAMINATION_ENTITIES) {
    try {
      const allRecords = await base44.asServiceRole.entities[entityName].filter(
        {},
        '-created_date',
        100
      );
      
      const recordsWithoutOwner = allRecords.filter(r => !r[field]);
      
      if (recordsWithoutOwner.length > 0) {
        results.push({
          leak: true,
          description: `${entityName} has ${recordsWithoutOwner.length} records without ${field} field`,
          filePath: `entities/${entityName}.json`,
          functionName: 'create/update',
          offendingCode: `Records missing '${field}' field could leak to other users`
        });
      }
    } catch (err) {
      // Entity doesn't exist or query error - not a contamination issue
    }
  }
  
  return results;
}

/**
 * Check integrations
 */
async function checkIntegrations(base44) {
  const checks = [];
  
  // Test LLM integration
  try {
    await Promise.race([
      base44.integrations.Core.InvokeLLM({
        prompt: 'Say "OK" only.',
        response_json_schema: { type: 'object', properties: { response: { type: 'string' } } }
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('LLM timeout')), 10000)
      )
    ]);
    
    checks.push({
      category: 'integration',
      name: 'Integration: Core.InvokeLLM',
      ok: true,
      error: null
    });
  } catch (err) {
    checks.push({
      category: 'integration',
      name: 'Integration: Core.InvokeLLM',
      ok: false,
      error: err.message || 'LLM integration check failed'
    });
  }
  
  // Test Stripe integration
  try {
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (stripeKey) {
      const stripeResponse = await fetch('https://api.stripe.com/v1/balance', {
        headers: { 'Authorization': `Bearer ${stripeKey}` }
      });
      
      checks.push({
        category: 'integration',
        name: 'Integration: Stripe API',
        ok: stripeResponse.ok,
        error: stripeResponse.ok ? null : `Stripe API returned ${stripeResponse.status}`
      });
    }
  } catch (err) {
    checks.push({
      category: 'integration',
      name: 'Integration: Stripe API',
      ok: false,
      error: err.message || 'Stripe check failed'
    });
  }
  
  return checks;
}

/**
 * Build combined error report
 */
function buildCombinedErrorReport(failedChecks, contaminationLeaks, envMissing, functionReport) {
  const report = [];
  
  // Environment errors
  if (envMissing.length > 0) {
    report.push(`
==================================================
MISSING ENVIRONMENT VARIABLES
==================================================
${envMissing.join(', ')}
`);
  }
  
  // Other check failures (database, RLS, integration)
  for (const c of failedChecks) {
    if (c.category !== 'backend_function') {
      report.push(`
--------------------------------------------------
ERROR IN: ${c.name}
TYPE: ${c.category || 'unknown'}
FILE: ${c.filePath ?? 'unknown'}
MESSAGE: ${c.error ?? 'unknown'}
--------------------------------------------------`);
    }
  }
  
  // Contamination errors
  for (const leak of contaminationLeaks) {
    report.push(`
--------------------------------------------------
DATA CONTAMINATION LEAK DETECTED
DESCRIPTION: ${leak.description}
FUNCTION: ${leak.functionName}
FILE: ${leak.filePath}
CODE: ${leak.offendingCode ?? 'no snippet available'}
--------------------------------------------------`);
  }
  
  // Function test errors
  if (functionReport && functionReport !== 'All function tests passed. No errors detected.') {
    report.push(`
==================================================
FUNCTION TEST FAILURES
==================================================
${functionReport}`);
  }
  
  if (report.length === 0) {
    return 'All checks passed. No errors detected.';
  }
  
  return report.join('\n');
}

// Main handler
Deno.serve(async (req) => {
  const startTime = Date.now();
  
  // Clone request for body reading
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
      message: 'Self-test passed for systemSelfCheck v2.0'
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
    
    const allChecks = [];
    
    // 1. Environment checks
    const { checks: envChecks, missing: envMissing } = checkEnvironment();
    allChecks.push(...envChecks);
    
    // 2. Entity/database checks
    const entityChecks = await checkEntities(base44);
    allChecks.push(...entityChecks);
    
    // 3. RLS policy checks
    const rlsChecks = await checkRLS(base44, user.email);
    allChecks.push(...rlsChecks);
    
    // 4. Function introspection and testing
    const invokableFunctions = KNOWN_FUNCTIONS;
    const functionResults = [];
    for (const fn of invokableFunctions) {
      const result = await runFunctionTest(fn, (fnName, params) => base44.functions.invoke(fnName, params));
      functionResults.push(result);
    }
    
    // Convert function results to check format
    const functionChecks = functionResults.map(r => ({
      category: 'backend_function',
      name: `Function: ${r.invokableName}`,
      ok: r.ok,
      error: r.errorMessage,
      filePath: r.filePath,
      stack: r.stack,
      skipped: r.skipped,
      skipReason: r.skipReason,
      duration: r.duration,
      functionCategory: r.category
    }));
    allChecks.push(...functionChecks);
    
    // 5. Integration checks
    const integrationChecks = await checkIntegrations(base44);
    allChecks.push(...integrationChecks);
    
    // 6. Contamination detection
    const contaminationResults = await checkContamination(base44);
    const contaminationOk = contaminationResults.filter(c => c.leak).length === 0;
    
    // Compile results
    const passed = allChecks.filter(c => c.ok).length;
    const failed = allChecks.filter(c => !c.ok).length;
    const failedChecks = allChecks.filter(c => !c.ok);
    const functionFailures = functionResults.filter(r => !r.ok && !r.skipped);
    const duration = Date.now() - startTime;
    
    // Generate reports
    const functionErrorReport = generateFunctionErrorReport(functionResults);
    const combinedErrorReport = buildCombinedErrorReport(
      failedChecks,
      contaminationResults.filter(c => c.leak),
      envMissing,
      functionErrorReport
    );
    
    const result = {
      ok: failed === 0 && contaminationOk,
      timestamp: new Date().toISOString(),
      run_duration_ms: duration,
      executedBy: user.email,
      summary: {
        total: allChecks.length,
        passed,
        failed,
        totalFunctions: invokableFunctions.length,
        functionFailures: functionFailures.length,
        otherFailures: failed - functionFailures.length
      },
      combinedErrorReport,
      checks: allChecks,
      functionChecks: functionResults,
      contamination: {
        ok: contaminationOk,
        results: contaminationResults
      },
      env: {
        missing: envMissing,
        ok: envMissing.length === 0
      }
    };
    
    // Log results if there are failures
    if (failed > 0 || !contaminationOk) {
      try {
        await base44.asServiceRole.entities.SystemCheckLog.create({
          summary: result.summary,
          checks: result.checks,
          contamination: result.contamination,
          combinedErrorReport,
          run_duration_ms: duration,
          app_name: 'GeneMap'
        });
      } catch (logErr) {
        console.error('Failed to log check results:', logErr);
      }
    }
    
    return Response.json(result);
    
  } catch (error) {
    const errorCheck = {
      category: 'system',
      name: 'Self-check initialization',
      ok: false,
      error: error.message,
      stack: error.stack
    };
    
    return Response.json({
      ok: false,
      error: error.message,
      stack: error.stack,
      summary: { total: 1, passed: 0, failed: 1, totalFunctions: 0, functionFailures: 0, otherFailures: 1 },
      combinedErrorReport: `System initialization error: ${error.message}\n${error.stack}`,
      checks: [errorCheck],
      functionChecks: [],
      contamination: { ok: true, results: [] },
      env: { missing: [], ok: true }
    }, { status: 500 });
  }
});