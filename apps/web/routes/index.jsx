import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Home from '../pages/Home.jsx';
import LearnPage from '../pages/LearnPage.jsx';
import ExplorePage from '../pages/ExplorePage.jsx';
import UploadInterpretPage from '../pages/UploadInterpretPage.jsx';
import TrialsPage from '../pages/TrialsPage.jsx';
import NotFoundPage from '../pages/NotFoundPage.jsx';

import AccountSettings from '../pages/AccountSettings.jsx';
import AdminAnalytics from '../pages/AdminAnalytics.jsx';
import AdminMessages from '../pages/AdminMessages.jsx';
import AxiomNewsletter from '../pages/AxiomNewsletter.jsx';
import BannedUsers from '../pages/BannedUsers.jsx';
import ContactSupport from '../pages/ContactSupport.jsx';
import Dashboard from '../pages/Dashboard.jsx';
import DemographicCollection from '../pages/DemographicCollection.jsx';
import DiscoveryStudio from '../pages/DiscoveryStudio.jsx';
import History from '../pages/History.jsx';
import IconGenerator from '../pages/IconGenerator.jsx';
import InstitutionalAdmin from '../pages/InstitutionalAdmin.jsx';
import InstitutionalPricing from '../pages/InstitutionalPricing.jsx';
import LearnGenetics from '../pages/LearnGenetics.jsx';
import LearningPath from '../pages/LearningPath.jsx';
import Login from '../pages/Login.jsx';
import Premium from '../pages/Premium.jsx';
import PrivacyPolicy from '../pages/PrivacyPolicy.jsx';
import Profile from '../pages/Profile.jsx';
import QuizMode from '../pages/QuizMode.jsx';
import ResearchMode from '../pages/ResearchMode.jsx';
import Search from '../pages/Search.jsx';
import SuperAdminSetup from '../pages/SuperAdminSetup.jsx';
import TermsOfService from '../pages/TermsOfService.jsx';
import TopicExplorer from '../pages/TopicExplorer.jsx';
import UsersLog from '../pages/UsersLog.jsx';

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/learn" element={<LearnPage />} />
      <Route path="/explore" element={<ExplorePage />} />
      <Route path="/upload" element={<UploadInterpretPage />} />
      <Route path="/trials" element={<TrialsPage />} />

      <Route path="/account-settings" element={<AccountSettings />} />
      <Route path="/admin-analytics" element={<AdminAnalytics />} />
      <Route path="/admin-messages" element={<AdminMessages />} />
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

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
