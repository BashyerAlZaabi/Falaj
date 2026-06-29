import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import { AppStateProvider } from "./contexts/AppStateContext";
import TrialReminder from "./components/TrialReminder";
import OnboardingTour from "./components/OnboardingTour";
import Welcome from "./pages/Welcome";
import LandingPage from "./pages/LandingPage";
import Registration from "./pages/Registration";
import Dashboard from "./pages/Dashboard";
import SensorsMap from "./pages/SensorsMap";
import SensorDetail from "./pages/SensorDetail";
import AIRecommendations from "./pages/AIRecommendations";
import Profile from "./pages/Profile";
import Rewards from "./pages/Rewards";
import Marketplace from "./pages/Marketplace";
import CreateListing from "./pages/CreateListing";
import VirtualOffice from "./pages/VirtualOffice";
import Admin from "./pages/Admin";
import OrderTracking from "./pages/OrderTracking";
import ProductDetail from "./pages/ProductDetail";
import Checkout from "./pages/Checkout";
import Chat from "./pages/Chat";
import ServiceBooking from "./pages/ServiceBooking";
import NotificationHistory from "./pages/NotificationHistory";
import FAQs from "./pages/FAQs";
import ContactSupport from "./pages/ContactSupport";
import Settings from "./pages/Settings";
import About from "./pages/About";
import AIAssistant from "./pages/AIAssistant";
import Community from "./pages/Community";
import GovernmentDashboard from "./pages/GovernmentDashboard";
import FarmResources from "./pages/FarmResources";
import SmartSensors from "./pages/SmartSensors";
import CropPlanning from "./pages/CropPlanning";
import SupplyChain from "./pages/SupplyChain";
import SupplyNotifications from "./pages/SupplyNotifications";
import Logistics from "./pages/Logistics";
import FinancialDashboard from "./pages/FinancialDashboard";
import FarmHub from "./pages/FarmHub";
import TradeHub from "./pages/TradeHub";
import MoneyHub from "./pages/MoneyHub";
import MoreHub from "./pages/MoreHub";
import DailyPlanner from "./pages/DailyPlanner";
import SensorCalibration from "./pages/SensorCalibration";
import SensorHistory from "./pages/SensorHistory";
import Packages from "./pages/Packages";
import Referrals from "./pages/Referrals";
import ReferralLeaderboard from "./pages/ReferralLeaderboard";

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/welcome" component={Welcome} />
      <Route path="/register" component={Registration} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/farm" component={FarmHub} />
      <Route path="/trade" component={TradeHub} />
      <Route path="/money" component={MoneyHub} />
      <Route path="/more" component={MoreHub} />
      <Route path="/sensors-map" component={SensorsMap} />
      <Route path="/sensors/:id" component={SensorDetail} />
      <Route path="/ai-recommendations" component={AIRecommendations} />
      <Route path="/profile" component={Profile} />
      <Route path="/rewards" component={Rewards} />
      <Route path="/marketplace" component={Marketplace} />
      <Route path="/marketplace/create" component={CreateListing} />
      <Route path="/marketplace/product/:id" component={ProductDetail} />
      <Route path="/marketplace/checkout" component={Checkout} />
      <Route path="/marketplace/cart" component={Checkout} />
      <Route path="/marketplace/virtual-office" component={VirtualOffice} />
      <Route path="/admin" component={Admin} />
      <Route path="/orders" component={OrderTracking} />
      <Route path="/chat" component={Chat} />
      <Route path="/services/book/:type" component={ServiceBooking} />
      <Route path="/notification-history" component={NotificationHistory} />
      <Route path="/faqs" component={FAQs} />
      <Route path="/contact-support" component={ContactSupport} />
      <Route path="/settings" component={Settings} />
      <Route path="/ai-assistant" component={AIAssistant} />
      <Route path="/community" component={Community} />
      <Route path="/about" component={About} />
      <Route path="/farm-resources" component={FarmResources} />
      <Route path="/smart-sensors" component={SmartSensors} />
      <Route path="/crop-planning" component={CropPlanning} />
      <Route path="/supply-chain" component={SupplyChain} />
      <Route path="/supply-notifications" component={SupplyNotifications} />
      <Route path="/logistics" component={Logistics} />
      <Route path="/financials" component={FinancialDashboard} />
      <Route path="/daily-planner" component={DailyPlanner} />
      <Route path="/sensor-calibration" component={SensorCalibration} />
      <Route path="/sensor-history" component={SensorHistory} />
      <Route path="/packages" component={Packages} />
      <Route path="/referrals" component={Referrals} />
      <Route path="/referral-leaderboard" component={ReferralLeaderboard} />
      <Route path="/government-dashboard" component={GovernmentDashboard} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <LanguageProvider>
          <AppStateProvider>
            <TooltipProvider>
              <Toaster />
              <TrialReminder />
              <OnboardingTour />
              <Router />
            </TooltipProvider>
          </AppStateProvider>
        </LanguageProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
