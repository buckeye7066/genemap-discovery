import Search from './pages/Search';
import Premium from './pages/Premium';
import History from './pages/History';
import IconGenerator from './pages/IconGenerator';
import Profile from './pages/Profile';
import MedicalData from './pages/MedicalData';
import Anastasia from './pages/Anastasia';
import RobertClinical from './pages/RobertClinical';
import VisualizationHub from './pages/VisualizationHub';
import ResearchMode from './pages/ResearchMode';
import Dashboard from './pages/Dashboard';
import AIAssistants from './pages/AIAssistants';
import VCFAnalysis from './pages/VCFAnalysis';
import InstitutionalAdmin from './pages/InstitutionalAdmin';
import InstitutionalPricing from './pages/InstitutionalPricing';
import BannedUsers from './pages/BannedUsers';
import DemographicCollection from './pages/DemographicCollection';
import SuperAdminSetup from './pages/SuperAdminSetup';
import AxiomNewsletter from './pages/AxiomNewsletter';
import UsersLog from './pages/UsersLog';
import GSEA from './pages/GSEA';
import AdminAnalytics from './pages/AdminAnalytics';
import ContactSupport from './pages/ContactSupport';
import AdminMessages from './pages/AdminMessages';
import Home from './pages/Home';
import AdminFunctionTester from './pages/AdminFunctionTester';
import FunctionReviewer from './pages/FunctionReviewer';
import LearnGenetics from './pages/LearnGenetics';
import TopicExplorer from './pages/TopicExplorer';
import QuizMode from './pages/QuizMode';
import LearningPath from './pages/LearningPath';
import __Layout from './Layout.jsx';


export const PAGES = {
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

export const pagesConfig = {
    mainPage: "LearnGenetics",
    Pages: PAGES,
    Layout: __Layout,
};