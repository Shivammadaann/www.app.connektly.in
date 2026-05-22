/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { getCachedSession, supabase } from './lib/supabase';
import { Session } from '@supabase/supabase-js';
import { Loader2 } from 'lucide-react';
import { AppDataProvider, useAppData } from './context/AppDataContext';
import { hasDashboardBillingAccess, isFreeTrialExpired } from './lib/billing';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Plans from './pages/Plans';
import OnboardingCompany from './pages/OnboardingCompany';
import OnboardingIndustry from './pages/OnboardingIndustry';
import OnboardingProfile from './pages/OnboardingProfile';
import ChannelConnection from './pages/ChannelConnection';
import InstagramAuthCallback from './pages/InstagramAuthCallback';

// Dashboard Components
import DashboardLayout from './layouts/DashboardLayout';
import Home from './pages/dashboard/Home';
import Inbox from './pages/dashboard/Inbox';
import Settings from './pages/dashboard/Settings';
import Calls from './pages/dashboard/Calls';
import EmailInbox from './pages/dashboard/EmailInbox';
import WalletBilling from './pages/dashboard/WalletBilling';
import Templates from './pages/dashboard/Templates';
import Broadcasts from './pages/dashboard/Broadcasts';
import Contacts from './pages/dashboard/Contacts';
import LeadList from './pages/dashboard/LeadList';
import BusinessProfile from './pages/dashboard/BusinessProfile';
import Catalog from './pages/dashboard/Catalog';
import Insights from './pages/dashboard/Insights';
import Integrations from './pages/dashboard/Integrations';
import Notifications from './pages/dashboard/Notifications';
import Automations from './pages/dashboard/Automations';
import AutomationVisualBuilder from './pages/dashboard/AutomationVisualBuilder';
import Flows from './pages/dashboard/Flows';
import DeveloperTools from './pages/dashboard/DeveloperTools';
import Emails from './pages/dashboard/Emails';
import MetaAds from './pages/dashboard/MetaAds';
import MetaAdsManager from './pages/dashboard/MetaAdsManager';

// Placeholder component for unimplemented dashboard routes
const Placeholder = ({ title }: { title: string }) => (
  <div className="flex items-center justify-center h-full">
    <div className="text-center">
      <h2 className="text-2xl font-bold text-gray-400 mb-2">{title}</h2>
      <p className="text-gray-500 text-sm">This feature is coming soon.</p>
    </div>
  </div>
);

const RootRoute = ({ session }: { session: Session | null }) => {
  return session ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />;
};

const ChannelsRedirect = () => {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  params.set('section', 'channels');

  return <Navigate to={`/dashboard/connections?${params.toString()}`} replace />;
};

const ProtectedRoute = ({ children, session }: { children: ReactNode, session: Session | null }) => {
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

const ProtectedApp = ({ session }: { session: Session | null }) => (
  <ProtectedRoute session={session}>
    <AppDataProvider>
      <Outlet />
    </AppDataProvider>
  </ProtectedRoute>
);

const GuardLoading = () => (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center">
    <Loader2 className="w-8 h-8 text-[#5b45ff] animate-spin" />
  </div>
);

const ONBOARDING_ROUTE_ORDER = [
  '/onboarding/plans',
  '/onboarding',
  '/onboarding/industry',
  '/onboarding/profile',
  '/onboarding/channel-connection',
] as const;

function getOnboardingRouteIndex(pathname: string) {
  return ONBOARDING_ROUTE_ORDER.findIndex((route) => route === pathname);
}

function useBillingClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(new Date());
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, []);

  return now;
}

function getRequiredOnboardingPath(bootstrap: ReturnType<typeof useAppData>['bootstrap']) {
  const profile = bootstrap?.profile;

  if (!hasDashboardBillingAccess(profile)) {
    return '/onboarding/plans';
  }

  if (!profile.companyName) {
    return '/onboarding';
  }

  if (!profile.industry) {
    return '/onboarding/industry';
  }

  if (!profile.fullName || !profile.phone || !profile.countryCode) {
    return '/onboarding/profile';
  }

  if (!profile.onboardingCompleted) {
    return '/onboarding/channel-connection';
  }

  return null;
}

const OnboardingRouteGuard = () => {
  const { bootstrap, isLoading } = useAppData();
  const location = useLocation();
  const now = useBillingClock();

  if (isLoading) {
    return <GuardLoading />;
  }

  if (isFreeTrialExpired(bootstrap?.profile, now)) {
    if (location.pathname === '/onboarding/plans') {
      return <Outlet />;
    }

    return <Navigate to="/onboarding/plans" replace />;
  }

  const requiredPath = getRequiredOnboardingPath(bootstrap);
  const canAccessOptionalChannelConnection =
    location.pathname === '/onboarding/channel-connection' &&
    Boolean(bootstrap?.profile?.onboardingCompleted) &&
    !bootstrap?.channel;

  if (!requiredPath) {
    if (canAccessOptionalChannelConnection) {
      return <Outlet />;
    }

    return <Navigate to="/dashboard/home" replace />;
  }

  const requestedStepIndex = getOnboardingRouteIndex(location.pathname);
  const requiredStepIndex = getOnboardingRouteIndex(requiredPath);

  if (requestedStepIndex === -1 || requiredStepIndex === -1 || requestedStepIndex > requiredStepIndex) {
    return <Navigate to={requiredPath} replace />;
  }

  return <Outlet />;
};

const DashboardRouteGuard = () => {
  const { bootstrap, isLoading } = useAppData();
  const now = useBillingClock();

  if (isLoading) {
    return <GuardLoading />;
  }

  if (isFreeTrialExpired(bootstrap?.profile, now)) {
    return <Navigate to="/onboarding/plans" replace />;
  }

  const requiredPath = getRequiredOnboardingPath(bootstrap);

  if (requiredPath) {
    return <Navigate to={requiredPath} replace />;
  }

  return <Outlet />;
};

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getCachedSession().then((session) => {
      setSession(session);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#5b45ff] animate-spin" />
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRoute session={session} />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/auth/instagram/callback" element={<InstagramAuthCallback />} />
        <Route path="/auth/meta/callback" element={<InstagramAuthCallback />} />

        <Route element={<ProtectedApp session={session} />}>
          <Route element={<OnboardingRouteGuard />}>
            <Route path="/onboarding/plans" element={<Plans />} />
            <Route path="/onboarding" element={<OnboardingCompany />} />
            <Route path="/onboarding/industry" element={<OnboardingIndustry />} />
            <Route path="/onboarding/profile" element={<OnboardingProfile />} />
            <Route path="/onboarding/channel-connection" element={<ChannelConnection />} />
          </Route>

          <Route element={<DashboardRouteGuard />}>
            <Route path="/dashboard" element={<DashboardLayout />}>
              <Route index element={<Navigate to="/dashboard/home" replace />} />
              <Route path="home" element={<Home />} />
              <Route path="inbox" element={<Inbox />} />
              <Route path="inbox/email" element={<EmailInbox />} />
              <Route path="analytics" element={<Navigate to="/dashboard/home" replace />} />
              <Route path="insights" element={<Insights />} />
              <Route path="calls" element={<Calls />} />
              <Route path="leads" element={<LeadList />} />
              <Route path="contacts" element={<Contacts />} />
              <Route path="templates" element={<Templates />} />
              <Route path="campaigns" element={<Broadcasts />} />
              <Route path="broadcasts" element={<Navigate to="/dashboard/campaigns" replace />} />
              <Route path="ads" element={<Navigate to="/dashboard/ads/meta-ads-manager" replace />} />
              <Route path="ads/manager" element={<MetaAds />} />
              <Route path="ads/meta-ads-manager" element={<MetaAdsManager />} />
              <Route path="ads/ctwa" element={<Navigate to="/dashboard/ads/manager" replace />} />
              <Route path="meta-ads" element={<Navigate to="/dashboard/ads/meta-ads-manager" replace />} />
              <Route path="meta-ads/ad-accounts" element={<Navigate to="/dashboard/ads/manager" replace />} />
              <Route path="meta-ads/connected-pages" element={<Navigate to="/dashboard/ads/manager" replace />} />
              <Route path="meta-ads/campaigns" element={<Navigate to="/dashboard/ads/meta-ads-manager" replace />} />
              <Route path="meta-ads/budget" element={<Navigate to="/dashboard/ads/meta-ads-manager" replace />} />
              <Route path="meta-ads/leads" element={<Navigate to="/dashboard/ads/manager" replace />} />
              <Route path="meta-ads/forms" element={<Navigate to="/dashboard/ads/manager" replace />} />
              <Route path="meta-ads/analytics" element={<Navigate to="/dashboard/ads/meta-ads-manager" replace />} />
              <Route path="ads/overview" element={<Navigate to="/dashboard/ads/meta-ads-manager" replace />} />
              <Route path="ads/create" element={<Navigate to="/dashboard/ads/manager" replace />} />
              <Route path="flows" element={<Navigate to="/dashboard/automations/flows" replace />} />
              <Route path="automations" element={<Automations />} />
              <Route path="automations/visual-builder" element={<AutomationVisualBuilder />} />
              <Route path="automations/flows" element={<Flows />} />
              <Route path="automations/triggers" element={<Automations />} />
              <Route path="commerce" element={<Navigate to="/dashboard/commerce/catalog" replace />} />
              <Route path="commerce/catalog" element={<Catalog />} />
              <Route path="profile" element={<BusinessProfile />} />
              <Route path="channels" element={<ChannelsRedirect />} />
              <Route path="channels/meta" element={<ChannelsRedirect />} />
              <Route path="channels/other" element={<ChannelsRedirect />} />
              <Route path="channel-status" element={<ChannelsRedirect />} />
              <Route path="crm/analytics" element={<Placeholder title="CRM Analytics" />} />
              <Route path="crm/reports" element={<Placeholder title="CRM Reports" />} />
              <Route path="crm/leads" element={<Navigate to="/dashboard/leads" replace />} />
              <Route path="crm/pipeline" element={<Placeholder title="Pipeline" />} />
              <Route path="crm/meta-lead-capture" element={<Navigate to="/dashboard/connections?integration=meta-lead-capture" replace />} />
              <Route path="billing/wallet" element={<WalletBilling />} />
              <Route path="credits/whatsapp" element={<Navigate to="/dashboard/billing/wallet" replace />} />
              <Route path="integrations" element={<Integrations />} />
              <Route path="integrations/meta-lead-capture" element={<Navigate to="/dashboard/connections?integration=meta-lead-capture" replace />} />
              <Route path="connections" element={<Integrations />} />
              <Route path="connections/meta" element={<Integrations />} />
              <Route path="connections/whatsapp" element={<Integrations />} />
              <Route path="connections/email" element={<Integrations />} />
              <Route path="connections/woocommerce" element={<Integrations />} />
              <Route path="connections/advanced" element={<DeveloperTools />} />
              <Route path="emails" element={<Emails />} />
              <Route path="emails/inbox" element={<Navigate to="/dashboard/inbox/email" replace />} />
              <Route path="emails/template-builder" element={<Emails />} />
              <Route path="templates/whatsapp" element={<Navigate to="/dashboard/templates" replace />} />
              <Route path="templates/email" element={<Navigate to="/dashboard/emails/template-builder" replace />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="developer" element={<DeveloperTools />} />
              <Route path="developer/api" element={<DeveloperTools />} />
              <Route path="developer/webhook" element={<DeveloperTools />} />
              <Route path="help" element={<Placeholder title="Help and Support" />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
