import { lazyWithRetry } from '@/lib/lazyWithRetry';
import __Layout from './Layout.jsx';

const Search = lazyWithRetry(() => import('./pages/Search'));
const Premium = lazyWithRetry(() => import('./pages/Premium'));
const History = lazyWithRetry(() => import('./pages/History'));
const Profile = lazyWithRetry(() => import('./pages/Profile'));
const ResearchMode = lazyWithRetry(() => import('./pages/ResearchMode'));
const Dashboard = lazyWithRetry(() => import('./pages/Dashboard'));
const InstitutionalAdmin = lazyWithRetry(() => import('./pages/InstitutionalAdmin'));
const InstitutionalPricing = lazyWithRetry(() => import('./pages/InstitutionalPricing'));
const BannedUsers = lazyWithRetry(() => import('./pages/BannedUsers'));
const DemographicCollection = lazyWithRetry(() => import('./pages/DemographicCollection'));
const SuperAdminSetup = lazyWithRetry(() => import('./pages/SuperAdminSetup'));
const AxiomNewsletter = lazyWithRetry(() => import('./pages/AxiomNewsletter'));
const UsersLog = lazyWithRetry(() => import('./pages/UsersLog'));
const AdminAnalytics = lazyWithRetry(() => import('./pages/AdminAnalytics'));
const ContactSupport = lazyWithRetry(() => import('./pages/ContactSupport'));
const AdminMessages = lazyWithRetry(() => import('./pages/AdminMessages'));
const Home = lazyWithRetry(() => import('./pages/Home'));
const LearnGenetics = lazyWithRetry(() => import('./pages/LearnGenetics'));
const TopicExplorer = lazyWithRetry(() => import('./pages/TopicExplorer'));
const QuizMode = lazyWithRetry(() => import('./pages/QuizMode'));
const LearningPath = lazyWithRetry(() => import('./pages/LearningPath'));
const Login = lazyWithRetry(() => import('./pages/Login'));
const PrivacyPolicy = lazyWithRetry(() => import('./pages/PrivacyPolicy'));
const TermsOfService = lazyWithRetry(() => import('./pages/TermsOfService'));

export const PAGES = {
    "Login": Login,
    "LearnGenetics": LearnGenetics,
    "TopicExplorer": TopicExplorer,
    "QuizMode": QuizMode,
    "LearningPath": LearningPath,
    "Search": Search,
    "Premium": Premium,
    "History": History,
    "Profile": Profile,
    "ResearchMode": ResearchMode,
    "Dashboard": Dashboard,
    "InstitutionalAdmin": InstitutionalAdmin,
    "InstitutionalPricing": InstitutionalPricing,
    "BannedUsers": BannedUsers,
    "DemographicCollection": DemographicCollection,
    "SuperAdminSetup": SuperAdminSetup,
    "AxiomNewsletter": AxiomNewsletter,
    "UsersLog": UsersLog,
    "AdminAnalytics": AdminAnalytics,
    "ContactSupport": ContactSupport,
    "AdminMessages": AdminMessages,
    "Home": Home,
    "PrivacyPolicy": PrivacyPolicy,
    "TermsOfService": TermsOfService,
}

// Legal/info pages reachable in BOTH auth states (logged-out visitors must be
// able to read them before signing up; logged-in users via the footer). They
// are deliberately NOT in publicPages (which redirect to "/" once authed) nor
// adminPages.
export const openPages = [
    "PrivacyPolicy",
    "TermsOfService",
];

// Owner/super-admin tooling. Each of these pages already self-guards and every
// /admin/* API route enforces requireRole on the server, but listing them here
// lets the router refuse to even render the shell for a non-admin — a third,
// centralized layer of defense so a future page that forgets its own guard
// still can't leak admin UI. (InstitutionalAdmin is intentionally excluded: it
// gates on owning an institutional license, not on the admin role.)
export const adminPages = [
    "UsersLog",
    "AdminAnalytics",
    "AdminMessages",
    "BannedUsers",
    "AxiomNewsletter",
];

// Super-admin ONLY. These change access controls or grant privileges.
// Gated to super_admin in the router (App.jsx) and hidden from a plain admin's
// nav (Layout.jsx `superAdminOnly`). A page here is intentionally NOT in
// adminPages, so the only gate that applies is the stricter super_admin one.
export const superAdminPages = [
    "SuperAdminSetup",
];

export const pagesConfig = {
    mainPage: "LearnGenetics",
    publicPages: ["Login"],
    adminPages,
    superAdminPages,
    openPages,
    Pages: PAGES,
    Layout: __Layout,
};

// The publishable build deliberately omits MedicalData, VCFAnalysis,
// AIAssistants, Anastasia, RobertClinical, VisualizationHub, and GSEA from both
// the route map and lazy-import graph. The first group contains personalized
// clinical execution. VisualizationHub and GSEA currently present LLM-generated
// coordinates, expression values, interactions, p-values, or FDR values as if
// they came from named databases or statistical computation. Those routes stay
// unavailable until they use versioned source adapters or real calculations.
