/**
 * Sync App Code to GitHub
 * 
 * Pushes all backend functions, components, and pages to a GitHub repo.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

const GITHUB_API = 'https://api.github.com';

// Static registry of all files to sync
const FILES_TO_SYNC = {
  backend: [
    'functions/createCheckoutSession.js',
    'functions/stripeWebhook.js',
    'functions/createInstitutionalCheckout.js',
    'functions/createPortalSession.js',
    'functions/deleteUser.js',
    'functions/getAllUsers.js',
    'functions/getBannedUsers.js',
    'functions/banUser.js',
    'functions/unbanUser.js',
    'functions/preBanUser.js',
    'functions/checkPreBanOnLogin.js',
    'functions/searchUsers.js',
    'functions/grantPremiumAccess.js',
    'functions/grantPremiumToUser.js',
    'functions/grantAdminPrivileges.js',
    'functions/testAllFunctions.js',
    'functions/getFunctionDetails.js',
    'functions/syncToGitHub.js',
  ],
  frontend: [
    'pages/Home.js',
    'pages/Dashboard.js',
    'pages/Search.js',
    'pages/History.js',
    'pages/Profile.js',
    'pages/Premium.js',
    'pages/MedicalData.js',
    'pages/VCFAnalysis.js',
    'pages/AIAssistants.js',
    'pages/RobertClinical.js',
    'pages/Anastasia.js',
    'pages/ResearchMode.js',
    'pages/VisualizationHub.js',
    'pages/GSEA.js',
    'pages/ContactSupport.js',
    'pages/AdminFunctionTester.js',
    'pages/FunctionReviewer.js',
    'pages/BannedUsers.js',
    'pages/UsersLog.js',
    'pages/AdminAnalytics.js',
    'pages/AdminMessages.js',
    'pages/InstitutionalAdmin.js',
    'pages/SuperAdminSetup.js',
    'pages/AxiomNewsletter.js',
    'pages/DemographicCollection.js',
  ],
  components: [
    'components/functionRegistry.js',
    'components/BanCheck.js',
    'components/DemographicCheck.js',
    'components/MelissaBanner.js',
    'components/PlatformCompatibility.js',
    'components/UniversalLinkHandler.js',
    'components/MobileOptimization.js',
    'components/AIConversation.js',
    'components/shared/logger.js',
    'components/shared/constants.js',
    'components/shared/errorUtils.js',
    'components/shared/dateUtils.js',
    'components/shared/safeNavigate.js',
    'components/shared/AskAIButtons.js',
    'components/search/PhenotypeSearchService.js',
    'components/search/SearchForm.js',
    'components/search/GeneResults.js',
    'components/search/GeneCard.js',
    'components/search/GeneComparison.js',
    'components/search/GeneInputForm.js',
    'components/search/GeneSetComparison.js',
    'components/search/SavedGeneSets.js',
    'components/search/ComparativeGenomics.js',
    'components/search/LoadingSpinner.js',
    'components/medical/VCFParser.js',
    'components/icons/DnaIcon.js',
  ],
  layout: [
    'Layout.js',
    'globals.css',
  ],
  entities: [
    'entities/Subscription.json',
    'entities/Message.json',
    'entities/AIConversation.json',
    'entities/SearchHistory.json',
    'entities/MedicalData.json',
    'entities/GeneSet.json',
    'entities/PreBannedUser.json',
    'entities/FunctionTestPayload.json',
    'entities/SystemCheckLog.json',
    'entities/UserActivity.json',
    'entities/ResearchProject.json',
    'entities/VisualizationConfig.json',
  ]
};

/**
 * Create or update a file in GitHub
 */
async function pushFileToGitHub(token, repo, path, content, message, existingSha = null) {
  const url = `${GITHUB_API}/repos/${repo}/contents/${path}`;
  
  const body = {
    message: message || `Update ${path}`,
    content: btoa(unescape(encodeURIComponent(content))), // Base64 encode
    branch: 'main'
  };
  
  if (existingSha) {
    body.sha = existingSha;
  }
  
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body)
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`GitHub API error: ${error.message || response.statusText}`);
  }
  
  return await response.json();
}

/**
 * Get existing file SHA (needed for updates)
 */
async function getFileSha(token, repo, path) {
  const url = `${GITHUB_API}/repos/${repo}/contents/${path}`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
    }
  });
  
  if (response.status === 404) {
    return null; // File doesn't exist
  }
  
  if (!response.ok) {
    return null;
  }
  
  const data = await response.json();
  return data.sha;
}

/**
 * Generate README for the repo
 */
function generateReadme(stats) {
  return `# GeneMap App Code Backup

Auto-synced from Base44 on ${new Date().toISOString()}

## Statistics
- **Backend Functions**: ${stats.backend}
- **Frontend Pages**: ${stats.frontend}
- **Components**: ${stats.components}
- **Entity Schemas**: ${stats.entities}
- **Layout Files**: ${stats.layout}

## Structure
\`\`\`
├── functions/          # Backend serverless functions
├── pages/              # React page components
├── components/         # Reusable React components
├── entities/           # Database entity schemas
├── Layout.js           # App layout wrapper
└── globals.css         # Global styles
\`\`\`

## Generated by Function Reviewer
This backup was created by the Function Reviewer system in the GeneMap Base44 app.
`;
}

Deno.serve(async (req) => {
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
      message: 'syncToGitHub self-test passed',
      filesConfigured: Object.values(FILES_TO_SYNC).flat().length
    });
  }
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({
        ok: false,
        error: 'Unauthorized. Admin access required.'
      }, { status: 403 });
    }
    
    const token = Deno.env.get('GITHUB_TOKEN');
    const repo = Deno.env.get('GITHUB_REPO');
    
    if (!token || !repo) {
      return Response.json({
        ok: false,
        error: 'GitHub credentials not configured. Set GITHUB_TOKEN and GITHUB_REPO in secrets.'
      }, { status: 400 });
    }
    
    const { codeBundle } = body;
    
    if (!codeBundle || typeof codeBundle !== 'object') {
      return Response.json({
        ok: false,
        error: 'Missing codeBundle in request. Frontend must send all code.'
      }, { status: 400 });
    }
    
    const results = {
      success: [],
      failed: [],
      skipped: []
    };
    
    const stats = {
      backend: 0,
      frontend: 0,
      components: 0,
      entities: 0,
      layout: 0
    };
    
    // Process each file in the bundle
    for (const [filePath, content] of Object.entries(codeBundle)) {
      if (!content || content.trim() === '') {
        results.skipped.push({ path: filePath, reason: 'Empty content' });
        continue;
      }
      
      try {
        // Get existing SHA if file exists
        const existingSha = await getFileSha(token, repo, filePath);
        
        // Push to GitHub
        await pushFileToGitHub(
          token,
          repo,
          filePath,
          content,
          `Sync ${filePath} from Base44 - ${new Date().toISOString()}`,
          existingSha
        );
        
        results.success.push(filePath);
        
        // Update stats
        if (filePath.startsWith('functions/')) stats.backend++;
        else if (filePath.startsWith('pages/')) stats.frontend++;
        else if (filePath.startsWith('components/')) stats.components++;
        else if (filePath.startsWith('entities/')) stats.entities++;
        else stats.layout++;
        
      } catch (err) {
        results.failed.push({ path: filePath, error: err.message });
      }
    }
    
    // Push README
    try {
      const readmeSha = await getFileSha(token, repo, 'README.md');
      await pushFileToGitHub(
        token,
        repo,
        'README.md',
        generateReadme(stats),
        'Update README with sync stats',
        readmeSha
      );
      results.success.push('README.md');
    } catch (err) {
      results.failed.push({ path: 'README.md', error: err.message });
    }
    
    return Response.json({
      ok: results.failed.length === 0,
      data: {
        synced: results.success.length,
        failed: results.failed.length,
        skipped: results.skipped.length,
        stats,
        details: results
      },
      repo: repo,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    return Response.json({
      ok: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});