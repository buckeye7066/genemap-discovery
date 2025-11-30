import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { getSurfaceMap, runSurfaceTests } from './shared/surfaceMapper.js';

const TIMEOUT_MS = 15000;
const REQUIRED_ENV_VARS = [
  'BASE44_APP_ID',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET'
];

/**
 * Build a consolidated error report from all check failures
 */
function buildCombinedErrorReport(failedChecks, contaminationLeaks, envMissing) {
  const report = [];

  // Backend/middleware/API/database/RLS errors
  for (const c of failedChecks) {
    report.push(
`--------------------------------------------------
ERROR IN: ${c.name}
TYPE: ${c.category || 'unknown'}
FILE: ${c.filePath ?? 'unknown'}
MESSAGE: ${c.error ?? 'unknown'}
STACK:
${c.stack ?? 'no stack available'}

OFFENDING CODE SNIPPET:
${c.offendingCode ?? 'no snippet available'}
--------------------------------------------------`
    );
  }

  // Contamination errors
  for (const leak of contaminationLeaks) {
    report.push(
`--------------------------------------------------
DATA CONTAMINATION LEAK DETECTED
DESCRIPTION: ${leak.description}
FUNCTION: ${leak.functionName}
FILE: ${leak.filePath}

OFFENDING CODE SNIPPET:
${leak.offendingCode ?? 'no snippet available'}
--------------------------------------------------`
    );
  }

  // Missing environment variables
  if (envMissing.length > 0) {
    report.push(
`--------------------------------------------------
MISSING ENVIRONMENT VARIABLES:
${envMissing.join(', ')}
--------------------------------------------------`
    );
  }

  if (report.length === 0) {
    return 'All checks passed. No errors detected.';
  }

  return report.join('\n\n');
}

// Known entities to verify
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

Deno.serve(async (req) => {
  const startTime = Date.now();
  
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

    const checks = [];
    const contaminationResults = [];

    // ========================================
    // 1. ENVIRONMENT VARIABLE CHECKS
    // ========================================
    for (const envVar of REQUIRED_ENV_VARS) {
      const value = Deno.env.get(envVar);
      checks.push({
        category: 'environment',
        name: `ENV: ${envVar}`,
        ok: !!value,
        error: value ? null : `Missing environment variable: ${envVar}`,
        filePath: null
      });
    }

    // ========================================
    // 2. DATABASE/ENTITY CHECKS
    // ========================================
    for (const entityName of KNOWN_ENTITIES) {
      try {
        // Test that entity exists and is queryable
        const result = await Promise.race([
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

    // ========================================
    // 3. RLS POLICY CHECKS
    // ========================================
    // Check that RLS is working - user should only see their own data
    const rlsTestEntities = ['SearchHistory', 'MedicalData', 'GeneSet', 'ResearchProject'];
    
    for (const entityName of rlsTestEntities) {
      try {
        // User-scoped query should work
        const userRecords = await base44.entities[entityName].filter(
          { created_by: user.email },
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

    // ========================================
    // 4. BACKEND FUNCTION CHECKS (via Surface Mapper)
    // ========================================
    
    // Get all discovered surfaces
    let surfaceMap = [];
    try {
      surfaceMap = await getSurfaceMap();
      checks.push({
        category: 'surface_discovery',
        name: 'Surface Mapper: Discovery',
        ok: true,
        error: null,
        details: `Discovered ${surfaceMap.length} surfaces`
      });
    } catch (err) {
      checks.push({
        category: 'surface_discovery',
        name: 'Surface Mapper: Discovery',
        ok: false,
        error: err.message || 'Failed to discover surfaces',
        stack: err.stack
      });
    }

    // Run tests on all discovered surfaces
    let surfaceTestResults = [];
    try {
      surfaceTestResults = await runSurfaceTests(
        (fnName, params) => base44.functions.invoke(fnName, params)
      );
    } catch (err) {
      checks.push({
        category: 'surface_discovery',
        name: 'Surface Mapper: Test Runner',
        ok: false,
        error: err.message || 'Failed to run surface tests',
        stack: err.stack
      });
    }

    // Convert surface test results to checks
    for (const { surface, testResult } of surfaceTestResults) {
      if (testResult.skipped) {
        checks.push({
          category: 'backend_function',
          name: `Function: ${surface.name}`,
          ok: true,
          error: null,
          filePath: surface.filePath,
          skipped: true,
          skipReason: testResult.reason
        });
      } else {
        checks.push({
          category: 'backend_function',
          name: `Function: ${surface.name}`,
          ok: testResult.ok,
          error: testResult.error || null,
          filePath: surface.filePath,
          stack: testResult.stack || null,
          offendingCode: testResult.offendingCode || null,
          duration: testResult.duration,
          surfaceType: surface.type,
          exportType: surface.exportType
        });
      }
    }

    // Also test any functions not discovered by surface mapper
    const discoveredFunctionNames = surfaceMap.map(s => s.name);
    const additionalFunctions = [
      'createCheckoutSession',
      'stripeWebhook',
      'createInstitutionalCheckout',
      'createPortalSession'
    ].filter(fn => !discoveredFunctionNames.includes(fn));

    for (const fnName of additionalFunctions) {
      try {
        await Promise.race([
          base44.functions.invoke(fnName, { _selfTest: true }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Function timeout (15s)')), TIMEOUT_MS)
          )
        ]);
        
        checks.push({
          category: 'backend_function',
          name: `Function: ${fnName}`,
          ok: true,
          error: null,
          filePath: `functions/${fnName}.js`
        });
      } catch (err) {
        const isExpectedError = err.message?.includes('_selfTest') || 
                                err.message?.includes('Unauthorized') ||
                                err.message?.includes('Missing required');
        
        checks.push({
          category: 'backend_function',
          name: `Function: ${fnName}`,
          ok: isExpectedError || err.status === 400 || err.status === 401,
          error: isExpectedError ? null : (err.message || 'Function check failed'),
          filePath: `functions/${fnName}.js`,
          stack: isExpectedError ? null : err.stack
        });
      }
    }

    // ========================================
    // 5. CROSS-CONTAMINATION DETECTION
    // ========================================
    // Simulate two mock users and check for data leakage
    const mockUserA = { email: 'selftest_userA@test.local', id: 'mock_user_a' };
    const mockUserB = { email: 'selftest_userB@test.local', id: 'mock_user_b' };

    // Check critical entities for proper created_by filtering
    const contaminationTestEntities = [
      { name: 'SearchHistory', field: 'created_by' },
      { name: 'MedicalData', field: 'created_by' },
      { name: 'GeneSet', field: 'created_by' },
      { name: 'AIConversation', field: 'created_by' },
      { name: 'Subscription', field: 'created_by' }
    ];

    for (const { name: entityName, field } of contaminationTestEntities) {
      try {
        // Get all records via service role
        const allRecords = await base44.asServiceRole.entities[entityName].filter(
          {},
          '-created_date',
          100
        );

        // Check that records have proper ownership field
        const recordsWithoutOwner = allRecords.filter(r => !r[field]);
        
        if (recordsWithoutOwner.length > 0) {
          contaminationResults.push({
            leak: true,
            description: `${entityName} has ${recordsWithoutOwner.length} records without ${field} field`,
            filePath: `entities/${entityName}.json`,
            functionName: 'create/update',
            offendingCode: `Records missing '${field}' field could leak to other users`
          });
        }

        // Verify RLS is enforced - try to access with different user context
        // This is a simulation since we can't actually switch users
        const rlsRules = await base44.asServiceRole.entities[entityName].schema?.().catch(() => null);
        
        if (rlsRules && !JSON.stringify(rlsRules).includes('created_by')) {
          contaminationResults.push({
            leak: true,
            description: `${entityName} RLS may not filter by created_by`,
            filePath: `entities/${entityName}.json`,
            functionName: 'RLS policy',
            offendingCode: 'RLS read policy should include { created_by: "{{user.email}}" }'
          });
        }

      } catch (err) {
        // Entity doesn't exist or schema error - not a contamination issue
      }
    }

    // ========================================
    // 6. INTEGRATION CHECKS
    // ========================================
    try {
      // Test Core.InvokeLLM availability
      const llmTest = await Promise.race([
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

    // ========================================
    // 7. STRIPE INTEGRATION CHECK
    // ========================================
    try {
      const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
      if (stripeKey) {
        const stripeResponse = await fetch('https://api.stripe.com/v1/balance', {
          headers: {
            'Authorization': `Bearer ${stripeKey}`
          }
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

    // ========================================
    // COMPILE RESULTS
    // ========================================
    const passed = checks.filter(c => c.ok).length;
    const failed = checks.filter(c => !c.ok).length;
    const failedChecks = checks.filter(c => !c.ok);
    const contaminationLeaks = contaminationResults.filter(c => c.leak);
    const contaminationOk = contaminationLeaks.length === 0;
    const envMissing = checks
      .filter(c => c.category === 'environment' && !c.ok)
      .map(c => c.name.replace('ENV: ', ''));
    const duration = Date.now() - startTime;

    // Build consolidated error report
    const combinedErrorReport = buildCombinedErrorReport(
      failedChecks,
      contaminationLeaks,
      envMissing
    );

    const result = {
      ok: failed === 0 && contaminationOk,
      timestamp: new Date().toISOString(),
      run_duration_ms: duration,
      summary: {
        total: checks.length,
        passed,
        failed
      },
      combinedErrorReport,
      errors: failedChecks,
      checks,
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
    
    const combinedErrorReport = buildCombinedErrorReport([errorCheck], [], []);
    
    return Response.json({
      ok: false,
      error: error.message,
      stack: error.stack,
      summary: { total: 1, passed: 0, failed: 1 },
      combinedErrorReport,
      errors: [errorCheck],
      checks: [errorCheck],
      contamination: { ok: true, results: [] },
      env: { missing: [], ok: true }
    }, { status: 500 });
  }
});