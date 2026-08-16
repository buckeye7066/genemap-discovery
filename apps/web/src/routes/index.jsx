import React, { lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Home from "../../pages/Home.jsx";
import LearnPage from "../pages/LearnPage.jsx";
import ExplorePage from "../pages/ExplorePage.jsx";
import UploadInterpretPage from "../pages/UploadInterpretPage.jsx";
import TrialsPage from "../pages/TrialsPage.jsx";
import NotFoundPage from "../pages/NotFoundPage.jsx";

const AccountSettings = lazy(() => import("../../pages/AccountSettings.jsx"));
const AdminAnalytics = lazy(() => import("../../pages/AdminAnalytics.jsx"));
const AdminMessages = lazy(() => import("../../pages/AdminMessages.jsx"));
const AxiomNewsletter = lazy(() => import("../../pages/AxiomNewsletter.jsx"));
const BannedUsers = lazy(() => import("../../pages/BannedUsers.jsx"));
const ContactSupport = lazy(() => import("../../pages/ContactSupport.jsx"));
const Dashboard = lazy(() => import("../../pages/Dashboard.jsx"));
const DemographicCollection = lazy(() => import("../../pages/DemographicCollection.jsx"));
const DiscoveryStudio = lazy(() => import("../../pages/DiscoveryStudio.jsx"));
const History = lazy(() => import("../../pages/History.jsx"));
const IconGenerator = lazy(() => import("../../pages/IconGenerator.jsx"));
const InstitutionalAdmin = lazy(() => import("../../pages/InstitutionalAdmin.jsx"));
const InstitutionalPricing = lazy(() => import("../../pages/InstitutionalPricing.jsx"));
const LearnGenetics = lazy(() => import("../../pages/LearnGenetics.jsx"));
const LearningPath = lazy(() => import("../../pages/LearningPath.jsx"));
const Login = lazy(() => import("../../pages/Login.jsx"));
const Premium = lazy(() => import("../../pages/Premium.jsx"));
const PrivacyPolicy = lazy(() => import("../../pages/PrivacyPolicy.jsx"));
const Profile = lazy(() => import("../../pages/Profile.jsx"));
const QuizMode = lazy(() => import("../../pages/QuizMode.jsx"));
const ResearchMode = lazy(() => import("../../pages/ResearchMode.jsx"));
const Search = lazy(() => import("../../pages/Search.jsx"));
const SuperAdminSetup = lazy(() => import("../../pages/SuperAdminSetup.jsx"));
const TermsOfService = lazy(() => import("../../pages/TermsOfService.jsx"));
const TopicExplorer = lazy(() => import("../../pages/TopicExplorer.jsx"));
const UsersLog = lazy(() => import("../../pages/UsersLog.jsx"));

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/learn" element={<LearnPage />} />
      <Route path="/explore" element={<ExplorePage />} />
      <Route path="/upload" element={<UploadInterpretPage />} />
      <Route path="/trials" element={<TrialsPage />} />

      <Route path="/account-settings" element={<AccountSettings />} />
      <Route path="/admin/analytics" element={<AdminAnalytics />} />
      <Route path="/admin/messages" element={<AdminMessages />} />
      <Route path="/axiom-newsletter" element={<AxiomNewsletter />} />
      <Route path="/banned-users" element={<BannedUsers />} />
      <Route path="/contact-support" element={<ContactSupport />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/demographic-collection" element={<DemographicCollection />} />
      <Route path="/discovery-studio" element={<DiscoveryStudio />} />
      <Route path="/history" element={<History />} />
      <Route path="/icon-generator" element={<IconGenerator />} />
      <Route path="/institutional-admin" element={<InstitutionalAdmin />} />
      <Route path="/institutional-pricing" element={<InstitutionalPricing />} />
      <Route path="/learn-genetics" element={<LearnGenetics />} />
      <Route path="/learning-path" element={<LearningPath />} />
      <Route path="/login" element={<Login />} />
      <Route path="/premium" element={<Premium />} />
      <Route path="/privacy-policy" element={<PrivacyPolicy />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/quiz-mode" element={<QuizMode />} />
      <Route path="/research-mode" element={<ResearchMode />} />
      <Route path="/search" element={<Search />} />
      <Route path="/super-admin-setup" element={<SuperAdminSetup />} />
      <Route path="/terms-of-service" element={<TermsOfService />} />
      <Route path="/topic-explorer" element={<TopicExplorer />} />
      <Route path="/users-log" element={<UsersLog />} />

      <Route path="/upload-interpret" element={<Navigate to="/upload" replace />} />
      <Route path="/explore-genes" element={<Navigate to="/explore" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
