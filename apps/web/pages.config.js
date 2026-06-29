import { lazy } from 'react';
import __Layout from './Layout.jsx';

const Search = lazy(() => import('./pages/Search'));
const Premium = lazy(() => import('./pages/Premium'));
const History = lazy(() => import('./pages/History'));
const IconGenerator = lazy(() => import('./pages/IconGenerator'));
const Profile = lazy(() => import('./pages/Profile'));
const MedicalData = lazy(() => import('./pages/MedicalData'));
const Anastasia = lazy(() => import('./pages/Anastasia'));
const RobertClinical = lazy(() => import('./pages/RobertClinical'));
const VisualizationHub = lazy(() => import('./pages/VisualizationHub'));
const ResearchMode = lazy(() => import('./pages/ResearchMode'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const AIAssistants = lazy(() => import('./pages/AIAssistants'));
const VCFAnalysis = lazy(() => import('./pages/VCFAnalysis'));
const InstitutionalAdmin = lazy(() => import('./pages/InstitutionalAdmin'));
const InstitutionalPricing = lazy(() => import('./pages/InstitutionalPricing'));
const BannedUsers = lazy(() => import('./pages/BannedUsers'));
const DemographicCollection = lazy(() => import('./pages/DemographicCollection'));
const SuperAdminSetup = lazy(() => import('./pages/SuperAdminSetup'));
const AxiomNewsletter = lazy(() => import('./pages/AxiomNewsletter'));
const UsersLog = lazy(() => import('./pages/UsersLog'));
const GSEA = lazy(() => import('./pages/GSEA'));
const AdminAnalytics = lazy(() => import('./pages/AdminAnalytics'));
const ContactSupport = lazy(() => import('./pages/ContactSupport'));
const AdminMessages = lazy(() => import('./pages/AdminMessages'));
const Home = lazy(() => import('./pages/Home'));
const AdminFunctionTester = lazy(() => import('./pages/AdminFunctionTester'));
const FunctionReviewer = lazy(() => import('./pages/FunctionReviewer'));
const LearnGenetics = lazy(() => import('./pages/LearnGenetics'));
const TopicExplorer = lazy(() => import('./pages/TopicExplorer'));
const QuizMode = lazy(() => import('./pages/QuizMode'));
const LearningPath = lazy(() => import('./pages/LearningPath'));
const Login = lazy(() => import('./pages/Login'));

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
