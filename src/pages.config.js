import Home from './pages/Home';
import Search from './pages/Search';
import Premium from './pages/Premium';
import History from './pages/History';
import IconGenerator from './pages/IconGenerator';
import Profile from './pages/Profile';
import MedicalData from './pages/MedicalData';
import Anastasia from './pages/Anastasia';
import RobertClinical from './pages/RobertClinical';
import Layout from './Layout.jsx';


export const PAGES = {
    "Home": Home,
    "Search": Search,
    "Premium": Premium,
    "History": History,
    "IconGenerator": IconGenerator,
    "Profile": Profile,
    "MedicalData": MedicalData,
    "Anastasia": Anastasia,
    "RobertClinical": RobertClinical,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: Layout,
};