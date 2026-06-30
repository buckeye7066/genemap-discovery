import { lazyWithRetry } from '@/lib/lazyWithRetry';
import __Layout from './Layout.jsx';

const Search = lazyWithRetry(() => import('./pages/Search'));
const Premium = lazyWithRetry(() => import('./pages/Premium'));
const History = lazyWithRetry(() => import('./pages/History'));
const IconGenerator = lazyWithRetry(() => import('./pages/IconGenerator'));
const Profile = lazyWithRetry(() => import('./pages/Profile'));
const MedicalData = lazyWithRetry(() => import('./pages/MedicalData'));
const Anastasia = lazyWithRetry(() => import('./pages/Anastasia'));
const RobertClinical = lazyWithRetry(() => import('./pages/RobertClinical'));
const VisualizationHub = lazyWithRetry(() => import('./pages/VisualizationHub'));
const ResearchMode = lazyWithRetry(() => import('./pages/ResearchMode'));
const Dashboard = lazyWithRetry(() => import('./pages/Dashboard'));
const AIAssistants = lazyWithRetry(() => import('./pages/AIAssistants'));
const VCFAnalysis = lazyWithRetry(() => import('./pages/VCFAnalysis'));
const InstitutionalAdmin = lazyWithRetry(() => import('./pages/InstitutionalAdmin'));
const InstitutionalPricing = lazyWithRetry(() => import('./pages/InstitutionalPricing'));
const BannedUsers = lazyWithRetry(() => import('./pages/BannedUsers'));
const DemographicCollection = lazyWithRetry(() => import('./pages/DemographicCollection'));
const SuperAdminSetup = lazyWithRetry(() => import('./pages/SuperAdminSetup'));
const AxiomNewsletter = lazyWithRetry(() => import('./pages/AxiomNewsletter'));
const UsersLog = lazyWithRetry(() => import('./pages/UsersLog'));
const GSEA = lazyWithRetry(() => import('./pages/GSEA'));
const AdminAnalytics = lazyWithRetry(() => import('./pages/AdminAnalytics'));
const ContactSupport = lazyWithRetry(() => import('./pages/ContactSupport'));
const AdminMessages = lazyWithRetry(() => import('./pages/AdminMessages'));
const Home = lazyWithRetry(() => import('./pages/Home'));
const AdminFunctionTester = lazyWithRetry(() => import('./pages/AdminFunctionTester'));
const FunctionReviewer = lazyWithRetry(() => import('./pages/FunctionReviewer'));
const LearnGenetics = lazyWithRetry(() => import('./pages/LearnGenetics'));
const TopicExplorer = lazyWithRetry(() => import('./pages/TopicExplorer'));
const QuizMode = lazyWithRetry(() => import('./pages/QuizMode'));
const LearningPath = lazyWithRetry(() => import('./pages/LearningPath'));
const Login = lazyWithRetry(() => import('./pages/Login'));

export const PAGES = {
    "Login": Login,
    "LearnGenetics": LearnGenetics,
    "TopicExplorer": TopicExplorer,
    "QuizMode": QuizMode,
    "LearningPath": LearningPath,
    "Search": Search,
    "Premium": Premium,
    "History": History,
    "IconGenerator": IconGenerator,
    "Profile": Profile,
    "MedicalData": MedicalData,
    "Anastasia": Anastasia,
    "RobertClinical": RobertClinical,
    "VisualizationHub": VisualizationHub,
    "ResearchMode": ResearchMode,
    "Dashboard": Dashboard,
    "AIAssistants": AIAssistants,
    "VCFAnalysis": VCFAnalysis,
    "InstitutionalAdmin": InstitutionalAdmin,
    "InstitutionalPricing": InstitutionalPricing,
    "BannedUsers": BannedUsers,
    "DemographicCollection": DemographicCollection,
    "SuperAdminSetup": SuperAdminSetup,
    "AxiomNewsletter": AxiomNewsletter,
    "UsersLog": UsersLog,
    "GSEA": GSEA,
    "AdminAnalytics": AdminAnalytics,
    "ContactSupport": ContactSupport,
    "AdminMessages": AdminMessages,
    "Home": Home,
    "AdminFunctionTester": AdminFunctionTester,
    "FunctionReviewer": FunctionReviewer,
}

// Owner/super-admin tooling. Each of these pages already self-guards and every
// /admin/* API route enforces requireRole on the server, but listing them here
// lets the router refuse to even render the shell for a non-admin — a third,
// centralized layer of defense so a future page that forgets its own guard
// still can't leak admin UI. (InstitutionalAdmin is intentionally excluded: it
// gates on owning an institutional license, not on the admin role.)
export const adminPages = [
    "SuperAdminSetup",
    "UsersLog",
    "AdminAnalytics",
    "AdminMessages",
    "BannedUsers",
    "AdminFunctionTester",
    "FunctionReviewer",
    "AxiomNewsletter",
];

export const pagesConfig = {
    mainPage: "LearnGenetics",
    publicPages: ["Login"],
    adminPages,
    Pages: PAGES,
    Layout: __Layout,
};
