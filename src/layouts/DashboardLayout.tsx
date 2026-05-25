import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { getCachedSession, supabase } from '../lib/supabase';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { useAppData } from '../context/AppDataContext';
import UserAvatar from '../components/UserAvatar';
import BrandMark from '../components/BrandMark';
import DashboardCallPopup from '../components/DashboardCallPopup';
import NotificationFeed from '../components/NotificationFeed';
import WalletDropdown from '../components/dashboard/WalletDropdown';
import { CallManagerProvider } from '../context/CallManagerContext';
import {
  appApi,
  DASHBOARD_API_ERROR_EVENT,
  type DashboardApiErrorEventDetail,
} from '../lib/api';
import { useEscapeKey } from '../lib/useEscapeKey';
import { getAuthUserDisplayName, getAuthUserProfilePictureUrl } from '../lib/userProfile';
import { getDefaultNotificationPreferences, getUnreadNotificationCount } from '../lib/notifications';
import { playNotificationChime } from '../lib/soundManager';
import {
  MessageSquare, 
  Users, 
  Megaphone, 
  FileText, 
  Zap, 
  GitMerge, 
  Phone, 
  Settings, 
  Bell,
  Workflow,
  Menu,
  Home,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  LogOut,
  HelpCircle,
  List,
  Package,
  Puzzle,
  Store,
  AlertTriangle,
  Mail,
  X,
  Wallet,
  Loader2,
} from 'lucide-react';

const HELP_CENTER_URL = 'https://connektly.in/help/';
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'connektly-sidebar-collapsed';

type NavIcon = typeof Home;

type SidebarChildItem = {
  icon: NavIcon;
  label: string;
  path: string;
  sectionLabel?: string;
  activePaths?: string[];
  activePrefixes?: string[];
};

type SidebarLinkItem = {
  id: string;
  type: 'link';
  icon: NavIcon;
  label: string;
  path: string;
  activePaths?: string[];
  activePrefixes?: string[];
};

type SidebarDropdownItem = {
  id: string;
  type: 'dropdown';
  icon: NavIcon;
  label: string;
  isOpen: boolean;
  toggle: () => void;
  children: SidebarChildItem[];
};

type SidebarItem = SidebarLinkItem | SidebarDropdownItem;
type SidebarDropdownId = 'contacts-leads' | 'inbox' | 'campaigns' | 'automations' | 'commerce' | 'templates';

function isSidebarRouteActive(
  pathname: string,
  path: string,
  activePaths: string[] = [],
  activePrefixes: string[] = [],
) {
  if ([path, ...activePaths].includes(pathname)) {
    return true;
  }

  return activePrefixes.some((prefix) => pathname.startsWith(prefix));
}

function getInitialSidebarCollapsed() {
  if (typeof window === 'undefined') {
    return false;
  }

  const storedValue = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);

  if (storedValue !== null) {
    return storedValue === 'true';
  }

  return window.innerWidth < 1280;
}

export default function DashboardLayout() {
  const { bootstrap, setBootstrap } = useAppData();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDesktopSidebarCollapsed, setIsDesktopSidebarCollapsed] = useState(getInitialSidebarCollapsed);
  const [activeCollapsedDropdown, setActiveCollapsedDropdown] = useState<string | null>(null);
  const [collapsedFlyoutTop, setCollapsedFlyoutTop] = useState<number | null>(null);
  const [isWalletMenuOpen, setIsWalletMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isContactsLeadsOpen, setIsContactsLeadsOpen] = useState(
    () =>
      location.pathname.startsWith('/dashboard/contacts') ||
      location.pathname.startsWith('/dashboard/leads') ||
      location.pathname.startsWith('/dashboard/crm'),
  );
  const [isInboxOpen, setIsInboxOpen] = useState(
    () => location.pathname.startsWith('/dashboard/inbox') || location.pathname.startsWith('/dashboard/calls'),
  );
  const [isCampaignsOpen, setIsCampaignsOpen] = useState(
    () =>
      location.pathname.startsWith('/dashboard/campaigns') ||
      location.pathname.startsWith('/dashboard/broadcasts') ||
      location.pathname.startsWith('/dashboard/ads') ||
      location.pathname.startsWith('/dashboard/meta-ads'),
  );
  const [isCommerceOpen, setIsCommerceOpen] = useState(() => location.pathname.startsWith('/dashboard/commerce'));
  const [isAutomationsOpen, setIsAutomationsOpen] = useState(
    () =>
      location.pathname.startsWith('/dashboard/automations') ||
      location.pathname === '/dashboard/flows',
  );
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(
    () =>
      location.pathname.startsWith('/dashboard/templates') ||
      location.pathname.startsWith('/dashboard/emails/template-builder'),
  );
  const [isSignOutModalOpen, setIsSignOutModalOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [apiErrorNotice, setApiErrorNotice] = useState<DashboardApiErrorEventDetail | null>(null);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const walletMenuRef = useRef<HTMLDivElement | null>(null);
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const collapsedFlyoutRef = useRef<HTMLDivElement | null>(null);
  const collapsedDropdownTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const previousLatestNotificationIdRef = useRef<string | null>(null);
  const hasInitializedNotificationSoundRef = useRef(false);
  const emailNotificationPollInFlightRef = useRef(false);
  const apiErrorNoticeTimerRef = useRef<number | null>(null);
  const showFinishOnboardingCta = Boolean(bootstrap?.profile?.onboardingCompleted && !bootstrap?.channel);
  const displayName = bootstrap?.profile?.fullName || getAuthUserDisplayName(user) || 'User';
  const displaySecondaryText = user?.email || bootstrap?.profile?.companyName || 'Workspace';
  const displayProfilePictureUrl =
    bootstrap?.profile?.profilePictureUrl || getAuthUserProfilePictureUrl(user);
  const wallet = bootstrap?.wallet;
  const isWalletEnabled = Boolean(wallet?.featureFlags.enablePlatformWallet);
  const notifications = bootstrap?.notifications || [];
  const notificationPreferences =
    bootstrap?.notificationPreferences ||
    getDefaultNotificationPreferences(bootstrap?.profile?.userId || user?.id || '');
  const unreadNotificationCount = useMemo(
    () => getUnreadNotificationCount(notifications),
    [notifications],
  );

  useEffect(() => {
    // Get initial session
    getCachedSession().then((session) => {
      setUser(session?.user ?? null);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(isDesktopSidebarCollapsed));
  }, [isDesktopSidebarCollapsed]);

  useEffect(() => {
    setActiveCollapsedDropdown(null);
    setCollapsedFlyoutTop(null);
  }, [isDesktopSidebarCollapsed, location.pathname]);

  const positionCollapsedFlyout = useCallback((dropdownId: string) => {
    const trigger = collapsedDropdownTriggerRefs.current[dropdownId];

    if (!trigger || typeof window === 'undefined') {
      setCollapsedFlyoutTop(null);
      return;
    }

    const triggerBounds = trigger.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const minimumTop = 72;
    const maximumTop = Math.max(minimumTop, viewportHeight - 96);
    const nextTop = Math.min(Math.max(triggerBounds.top, minimumTop), maximumTop);

    setCollapsedFlyoutTop(nextTop);
  }, []);

  useEffect(() => {
    if (!isDesktopSidebarCollapsed || !activeCollapsedDropdown) {
      setCollapsedFlyoutTop(null);
      return;
    }

    const updateFlyoutPosition = () => positionCollapsedFlyout(activeCollapsedDropdown);

    updateFlyoutPosition();
    window.addEventListener('resize', updateFlyoutPosition);
    window.addEventListener('scroll', updateFlyoutPosition, true);

    return () => {
      window.removeEventListener('resize', updateFlyoutPosition);
      window.removeEventListener('scroll', updateFlyoutPosition, true);
    };
  }, [activeCollapsedDropdown, isDesktopSidebarCollapsed, positionCollapsedFlyout]);

  useEffect(() => {
    if (!isDesktopSidebarCollapsed || !activeCollapsedDropdown) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const activeTrigger = collapsedDropdownTriggerRefs.current[activeCollapsedDropdown];

      if (activeTrigger?.contains(target) || collapsedFlyoutRef.current?.contains(target)) {
        return;
      }

      setActiveCollapsedDropdown(null);
      setCollapsedFlyoutTop(null);
    };

    document.addEventListener('mousedown', handlePointerDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [activeCollapsedDropdown, isDesktopSidebarCollapsed]);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleApiError = (event: Event) => {
      const detail = (event as CustomEvent<DashboardApiErrorEventDetail>).detail;

      if (!detail?.message) {
        return;
      }

      setApiErrorNotice(detail);

      if (apiErrorNoticeTimerRef.current) {
        window.clearTimeout(apiErrorNoticeTimerRef.current);
      }

      apiErrorNoticeTimerRef.current = window.setTimeout(() => {
        setApiErrorNotice(null);
        apiErrorNoticeTimerRef.current = null;
      }, 10000);
    };

    window.addEventListener(DASHBOARD_API_ERROR_EVENT, handleApiError);

    return () => {
      window.removeEventListener(DASHBOARD_API_ERROR_EVENT, handleApiError);

      if (apiErrorNoticeTimerRef.current) {
        window.clearTimeout(apiErrorNoticeTimerRef.current);
        apiErrorNoticeTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    setIsNotificationsOpen(false);
    setIsWalletMenuOpen(false);
    setIsAccountMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileMenuOpen]);

  useEffect(() => {
    if (!isWalletMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (walletMenuRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsWalletMenuOpen(false);
    };

    window.addEventListener('pointerdown', handlePointerDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isWalletMenuOpen]);

  useEffect(() => {
    if (!isNotificationsOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (notificationsRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsNotificationsOpen(false);
    };

    window.addEventListener('pointerdown', handlePointerDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isNotificationsOpen]);

  useEffect(() => {
    if (!isAccountMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (accountMenuRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsAccountMenuOpen(false);
    };

    window.addEventListener('pointerdown', handlePointerDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isAccountMenuOpen]);

  useEffect(() => {
    const latestNotification = notifications[0];

    if (!hasInitializedNotificationSoundRef.current) {
      hasInitializedNotificationSoundRef.current = true;
      previousLatestNotificationIdRef.current = latestNotification?.id || null;
      return;
    }

    if (!latestNotification) {
      previousLatestNotificationIdRef.current = null;
      return;
    }

    if (previousLatestNotificationIdRef.current !== latestNotification.id) {
      previousLatestNotificationIdRef.current = latestNotification.id;

      if (!latestNotification.isRead) {
        playNotificationChime(notificationPreferences);
      }
    }
  }, [notificationPreferences, notifications]);

  useEffect(() => {
    if (!user?.id || !notificationPreferences.enabled || !notificationPreferences.incomingEmailEnabled) {
      return;
    }

    let isCancelled = false;

    const pollIncomingEmails = async () => {
      if (isCancelled || document.visibilityState !== 'visible' || emailNotificationPollInFlightRef.current) {
        return;
      }

      emailNotificationPollInFlightRef.current = true;

      try {
        const connectionResponse = await appApi.getEmailConnection();

        if (!connectionResponse.connection || isCancelled) {
          return;
        }

        await appApi.getEmailInbox();
      } catch {
        // Silent background sync for inbox email notifications.
      } finally {
        emailNotificationPollInFlightRef.current = false;
      }
    };

    void pollIncomingEmails();

    const intervalId = window.setInterval(() => {
      void pollIncomingEmails();
    }, 90_000);

    const handleWindowFocus = () => {
      void pollIncomingEmails();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void pollIncomingEmails();
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [
    notificationPreferences.enabled,
    notificationPreferences.incomingEmailEnabled,
    user?.id,
  ]);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    setIsSignOutModalOpen(false);
    setIsMobileMenuOpen(false);
    setIsAccountMenuOpen(false);

    try {
      await supabase.auth.signOut();
    } finally {
      navigate('/login');
    }
  };

  const toggleDesktopSidebar = () => {
    setIsDesktopSidebarCollapsed((previousValue) => !previousValue);
  };

  const markNotificationReadLocally = (notificationId?: string | null) => {
    setBootstrap((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        notifications: current.notifications.map((notification) =>
          !notificationId || notification.id === notificationId
            ? {
                ...notification,
                isRead: true,
                readAt: notification.readAt || new Date().toISOString(),
              }
            : notification,
        ),
      };
    });
  };

  const handleNotificationSelect = async (notification: (typeof notifications)[number]) => {
    if (!notification.isRead) {
      markNotificationReadLocally(notification.id);
      void appApi.markNotificationsRead({ notificationId: notification.id }).catch(() => undefined);
    }

    setIsNotificationsOpen(false);

    if (notification.targetPath) {
      navigate(notification.targetPath);
      return;
    }

    navigate('/dashboard/notifications');
  };

  const handleMarkNotificationRead = (notification: (typeof notifications)[number]) => {
    if (notification.isRead) {
      return;
    }

    markNotificationReadLocally(notification.id);
    void appApi.markNotificationsRead({ notificationId: notification.id }).catch(() => undefined);
  };

  const handleMarkAllNotificationsRead = async () => {
    markNotificationReadLocally(null);
    await appApi.markNotificationsRead({ markAll: true });
  };

  useEscapeKey(
    Boolean(
      isSignOutModalOpen ||
        isMobileMenuOpen ||
        isAccountMenuOpen ||
        isWalletMenuOpen ||
        isNotificationsOpen ||
        activeCollapsedDropdown,
    ),
    () => {
      if (isSignOutModalOpen) {
        setIsSignOutModalOpen(false);
        return;
      }

      if (isMobileMenuOpen) {
        setIsMobileMenuOpen(false);
        return;
      }

      if (isAccountMenuOpen) {
        setIsAccountMenuOpen(false);
        return;
      }

      if (isWalletMenuOpen) {
        setIsWalletMenuOpen(false);
        return;
      }

      if (isNotificationsOpen) {
        setIsNotificationsOpen(false);
        return;
      }

      if (activeCollapsedDropdown) {
        setActiveCollapsedDropdown(null);
      }
    },
  );

  const isNavItemActive = (item: Pick<SidebarLinkItem, 'path' | 'activePaths' | 'activePrefixes'>) =>
    isSidebarRouteActive(location.pathname, item.path, item.activePaths, item.activePrefixes);

  const toggleSidebarDropdown = (dropdownId: SidebarDropdownId) => {
    setActiveCollapsedDropdown(null);
    setIsContactsLeadsOpen((current) => (dropdownId === 'contacts-leads' ? !current : false));
    setIsInboxOpen((current) => (dropdownId === 'inbox' ? !current : false));
    setIsCampaignsOpen((current) => (dropdownId === 'campaigns' ? !current : false));
    setIsAutomationsOpen((current) => (dropdownId === 'automations' ? !current : false));
    setIsCommerceOpen((current) => (dropdownId === 'commerce' ? !current : false));
    setIsTemplatesOpen((current) => (dropdownId === 'templates' ? !current : false));
  };

  const navStructure: SidebarItem[] = [
    { id: 'home', type: 'link', icon: Home, label: 'Home', path: '/dashboard/home' },
    {
      id: 'contacts-leads',
      type: 'dropdown',
      icon: Users,
      label: 'Contacts & Leads',
      isOpen: isContactsLeadsOpen,
      toggle: () => toggleSidebarDropdown('contacts-leads'),
      children: [
        {
          icon: Users,
          label: 'Contacts',
          path: '/dashboard/contacts',
        },
        {
          icon: List,
          label: 'Lead List',
          path: '/dashboard/leads',
          activePaths: ['/dashboard/crm/leads'],
        },
      ],
    },
    {
      id: 'inbox',
      type: 'dropdown',
      icon: MessageSquare,
      label: 'Inbox',
      isOpen: isInboxOpen,
      toggle: () => toggleSidebarDropdown('inbox'),
      children: [
        {
          icon: MessageSquare,
          label: 'All Conversations',
          path: '/dashboard/inbox',
        },
        {
          icon: Mail,
          label: 'Email Inbox',
          path: '/dashboard/inbox/email',
          activePaths: ['/dashboard/emails/inbox'],
        },
        {
          icon: Phone,
          label: 'WhatsApp Calls',
          path: '/dashboard/calls',
        },
      ],
    },
    {
      id: 'templates',
      type: 'dropdown',
      icon: FileText,
      label: 'Templates',
      isOpen: isTemplatesOpen,
      toggle: () => toggleSidebarDropdown('templates'),
      children: [
        {
          icon: FileText,
          label: 'WhatsApp Templates',
          path: '/dashboard/templates',
        },
        {
          icon: Mail,
          label: 'Email Templates',
          path: '/dashboard/emails/template-builder',
          activePaths: ['/dashboard/emails'],
        },
      ],
    },
    {
      id: 'campaigns',
      type: 'dropdown',
      icon: Megaphone,
      label: 'Campaigns',
      isOpen: isCampaignsOpen,
      toggle: () => toggleSidebarDropdown('campaigns'),
      children: [
        {
          icon: Megaphone,
          label: 'WhatsApp Campaigns',
          path: '/dashboard/campaigns',
          activePaths: ['/dashboard/broadcasts'],
        },
        {
          icon: Megaphone,
          label: 'Overview',
          path: '/dashboard/ads/meta-ads-manager',
          sectionLabel: 'Ads',
          activePaths: ['/dashboard/ads', '/dashboard/meta-ads', '/dashboard/meta-ads/campaigns', '/dashboard/meta-ads/budget', '/dashboard/meta-ads/analytics'],
        },
        {
          icon: MessageSquare,
          label: 'Create Ad',
          path: '/dashboard/ads/manager',
          sectionLabel: 'Ads',
          activePaths: ['/dashboard/ads/ctwa', '/dashboard/meta-ads/ad-accounts', '/dashboard/meta-ads/connected-pages'],
        },
      ],
    },
    {
      id: 'automations',
      type: 'dropdown',
      icon: Zap,
      label: 'Automations',
      isOpen: isAutomationsOpen,
      toggle: () => toggleSidebarDropdown('automations'),
      children: [
        {
          icon: Workflow,
          label: 'Visual Builder',
          path: '/dashboard/automations/visual-builder',
        },
        {
          icon: GitMerge,
          label: 'Flows',
          path: '/dashboard/automations/flows',
          activePaths: ['/dashboard/flows'],
        },
        {
          icon: Zap,
          label: 'Triggers',
          path: '/dashboard/automations/triggers',
          activePaths: ['/dashboard/automations'],
        },
      ],
    },
    {
      id: 'commerce',
      type: 'dropdown',
      icon: Store,
      label: 'Commerce',
      isOpen: isCommerceOpen,
      toggle: () => toggleSidebarDropdown('commerce'),
      children: [
        {
          icon: Package,
          label: 'Catalog',
          path: '/dashboard/commerce/catalog',
          activePaths: ['/dashboard/commerce'],
        },
      ],
    },
    {
      id: 'connections',
      type: 'link',
      icon: Puzzle,
      label: 'Connections',
      path: '/dashboard/connections',
      activePaths: ['/dashboard/integrations', '/dashboard/integrations/meta-lead-capture', '/dashboard/channel-status'],
      activePrefixes: ['/dashboard/connections', '/dashboard/developer', '/dashboard/channels'],
    },
  ];

  if (isSigningOut) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-6 font-sans">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
            <Loader2 className="h-8 w-8 animate-spin text-[#2364ff]" />
          </div>
          <h1 className="mt-5 text-xl font-semibold text-gray-900">Signing out</h1>
          <p className="mt-2 text-sm text-gray-500">Ending your session securely.</p>
        </div>
      </div>
    );
  }

  return (
    <CallManagerProvider>
      <div className="dashboard-shell flex h-[100dvh] overflow-hidden font-sans">
      {/* Sidebar (Dark Theme) */}
      <aside
        className={`hidden md:flex flex-col bg-[#111827] text-gray-400 transition-[width] duration-300 z-20 ${
          isDesktopSidebarCollapsed ? 'w-20' : 'w-72'
        }`}
      >
        <div
          className={`h-16 flex items-center justify-between border-b border-gray-800 shrink-0 ${
            isDesktopSidebarCollapsed ? 'px-3' : 'px-4'
          }`}
        >
          <div className="flex items-center min-w-0">
            <BrandMark className="h-8 w-8 shrink-0" />
            {!isDesktopSidebarCollapsed ? (
              <span className="ml-3 truncate text-white font-bold text-xl tracking-tight">Connektly</span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={toggleDesktopSidebar}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
            aria-label={isDesktopSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={isDesktopSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4 scrollbar-hide">
          <nav className="space-y-1 px-3">
            {navStructure.map((item) => {
              if (item.type === 'link') {
                const isExternalLink = item.path.startsWith('http');
                const isActive = isExternalLink ? false : isNavItemActive(item);

                if (isExternalLink) {
                  return (
                    <a
                      key={item.id}
                      href={item.path}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setActiveCollapsedDropdown(null)}
                      className={`flex items-center px-3 py-3 rounded-xl transition-colors group relative hover:bg-gray-800 hover:text-white ${
                        isDesktopSidebarCollapsed ? 'justify-center' : ''
                      }`}
                      title={item.label}
                    >
                      <item.icon className="w-5 h-5 shrink-0 text-gray-400 group-hover:text-white" />
                      {!isDesktopSidebarCollapsed ? (
                        <span className="ml-3 text-sm font-medium whitespace-nowrap">
                          {item.label}
                        </span>
                      ) : null}
                      {isDesktopSidebarCollapsed ? (
                        <div className="absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap">
                          {item.label}
                        </div>
                      ) : null}
                    </a>
                  );
                }

                return (
                  <NavLink
                    key={item.id}
                    to={item.path!}
                    onClick={() => setActiveCollapsedDropdown(null)}
                    className={`flex items-center px-3 py-3 rounded-xl transition-colors group relative ${
                      isActive 
                        ? 'bg-[#5b45ff] text-white' 
                        : 'hover:bg-gray-800 hover:text-white'
                    } ${
                      isDesktopSidebarCollapsed ? 'justify-center' : ''
                    }`}
                    title={item.label}
                  >
                    <item.icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-white'}`} />
                    {!isDesktopSidebarCollapsed ? (
                      <span className="ml-3 text-sm font-medium whitespace-nowrap">
                        {item.label}
                      </span>
                    ) : null}
                    {isDesktopSidebarCollapsed ? (
                      <div className="absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap">
                        {item.label}
                      </div>
                    ) : null}
                  </NavLink>
                );
              }

              if (item.type === 'dropdown') {
                const isChildActive = item.children.some((child) => isNavItemActive(child));
                const isCollapsedFlyoutOpen = isDesktopSidebarCollapsed && activeCollapsedDropdown === item.id;
                const shouldHighlightDropdownTrigger = isDesktopSidebarCollapsed
                  ? isChildActive || isCollapsedFlyoutOpen
                  : Boolean(isChildActive && !item.isOpen);
                
                return (
                  <div key={item.id} className="space-y-1 relative">
                    <button
                      ref={(element) => {
                        collapsedDropdownTriggerRefs.current[item.id] = element;
                      }}
                      onClick={() => {
                        if (isDesktopSidebarCollapsed) {
                          if (activeCollapsedDropdown === item.id) {
                            setActiveCollapsedDropdown(null);
                            setCollapsedFlyoutTop(null);
                          } else {
                            positionCollapsedFlyout(item.id);
                            setActiveCollapsedDropdown(item.id);
                          }
                          return;
                        }

                        item.toggle();
                      }}
                      className={`w-full flex items-center px-3 py-3 rounded-xl transition-colors group relative ${
                        shouldHighlightDropdownTrigger
                          ? 'bg-gray-800 text-white' 
                          : 'hover:bg-gray-800 hover:text-white'
                      } ${
                        isDesktopSidebarCollapsed ? 'justify-center' : 'justify-between'
                      }`}
                      title={item.label}
                    >
                      <div className="flex items-center">
                        <item.icon className={`w-5 h-5 shrink-0 ${isChildActive ? 'text-white' : 'text-gray-400 group-hover:text-white'}`} />
                        {!isDesktopSidebarCollapsed ? (
                          <span className="ml-3 text-sm font-medium whitespace-nowrap">
                            {item.label}
                          </span>
                        ) : null}
                      </div>
                      {!isDesktopSidebarCollapsed ? (
                        item.isOpen ? (
                          <ChevronDown className="w-4 h-4 text-gray-500 group-hover:text-white" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-white" />
                        )
                      ) : null}
                      {isDesktopSidebarCollapsed ? (
                        <div className="absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap">
                          {item.label}
                        </div>
                      ) : null}
                    </button>

                    <AnimatePresence>
                      {!isDesktopSidebarCollapsed && item.isOpen && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="pl-11 pr-3 py-1 space-y-1">
                            {item.children.map((child, childIndex) => {
                              const isActive = isNavItemActive(child);
                              const shouldShowSectionLabel =
                                child.sectionLabel &&
                                item.children[childIndex - 1]?.sectionLabel !== child.sectionLabel;

                              return (
                                <Fragment key={child.path}>
                                  {shouldShowSectionLabel ? (
                                    <div className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-600">
                                      {child.sectionLabel}
                                    </div>
                                  ) : null}
                                  <NavLink
                                    to={child.path}
                                    className={`flex items-center px-3 py-2 rounded-lg transition-colors text-sm ${
                                      isActive
                                        ? 'bg-[#5b45ff] text-white font-medium'
                                        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                                    }`}
                                  >
                                    <child.icon className={`w-4 h-4 mr-3 shrink-0 ${isActive ? 'text-white' : 'text-gray-500'}`} />
                                    <span className="truncate">{child.label}</span>
                                  </NavLink>
                                </Fragment>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <AnimatePresence>
                      {isCollapsedFlyoutOpen ? (
                        <motion.div
                          initial={{ opacity: 0, x: -8, scale: 0.98 }}
                          animate={{ opacity: 1, x: 0, scale: 1 }}
                          exit={{ opacity: 0, x: -8, scale: 0.98 }}
                          ref={collapsedFlyoutRef}
                          style={{
                            left: 92,
                            top: collapsedFlyoutTop ?? 72,
                            maxHeight: `calc(100vh - ${(collapsedFlyoutTop ?? 72) + 16}px)`,
                          }}
                          className="fixed z-[70] w-64 overflow-y-auto rounded-2xl border border-gray-800 bg-[#111827] p-2 shadow-2xl"
                        >
                          <div className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
                            {item.label}
                          </div>
                          <div className="space-y-1">
                            {item.children.map((child, childIndex) => {
                              const isActive = isNavItemActive(child);
                              const shouldShowSectionLabel =
                                child.sectionLabel &&
                                item.children[childIndex - 1]?.sectionLabel !== child.sectionLabel;

                              return (
                                <Fragment key={child.path}>
                                  {shouldShowSectionLabel ? (
                                    <div className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-600">
                                      {child.sectionLabel}
                                    </div>
                                  ) : null}
                                  <NavLink
                                    to={child.path}
                                    onClick={() => setActiveCollapsedDropdown(null)}
                                    className={`flex items-center px-3 py-2.5 rounded-xl transition-colors text-sm ${
                                      isActive
                                        ? 'bg-[#5b45ff] text-white font-medium'
                                        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                                    }`}
                                  >
                                    <child.icon className={`w-4 h-4 mr-3 shrink-0 ${isActive ? 'text-white' : 'text-gray-500'}`} />
                                    <span className="truncate">{child.label}</span>
                                  </NavLink>
                                </Fragment>
                              );
                            })}
                          </div>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                );
              }
              return null;
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-gray-800 space-y-1 shrink-0">
          <NavLink
            to="/dashboard/settings"
            onClick={() => setActiveCollapsedDropdown(null)}
            className={`flex items-center px-3 py-3 rounded-xl hover:bg-gray-800 hover:text-white transition-colors group relative ${
              isDesktopSidebarCollapsed ? 'justify-center' : ''
            }`}
            title="Settings"
          >
            <Settings className="w-5 h-5 shrink-0 text-gray-400 group-hover:text-white" />
            {!isDesktopSidebarCollapsed ? <span className="ml-3 text-sm font-medium">Settings</span> : null}
            {isDesktopSidebarCollapsed ? (
              <div className="absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap">
                Settings
              </div>
            ) : null}
          </NavLink>
          <a
            href={HELP_CENTER_URL}
            target="_blank"
            rel="noreferrer"
            onClick={() => setActiveCollapsedDropdown(null)}
            className={`flex items-center px-3 py-3 rounded-xl hover:bg-gray-800 hover:text-white transition-colors group relative ${
              isDesktopSidebarCollapsed ? 'justify-center' : ''
            }`}
            title="Help and Support"
          >
            <HelpCircle className="w-5 h-5 shrink-0 text-gray-400 group-hover:text-white" />
            {!isDesktopSidebarCollapsed ? (
              <>
                <span className="ml-3 flex-1 text-sm font-medium">Help and Support</span>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-gray-500 transition group-hover:text-white" aria-hidden="true" />
              </>
            ) : null}
            {isDesktopSidebarCollapsed ? (
              <div className="absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap">
                Help and Support
              </div>
            ) : null}
          </a>
          <button
            onClick={() => setIsSignOutModalOpen(true)}
            className={`w-full flex items-center px-3 py-3 rounded-xl hover:bg-red-500/10 hover:text-red-500 transition-colors group relative text-gray-400 ${
              isDesktopSidebarCollapsed ? 'justify-center' : ''
            }`}
            title="Sign out"
          >
            <LogOut className="w-5 h-5 shrink-0 group-hover:text-red-500" />
            {!isDesktopSidebarCollapsed ? <span className="ml-3 text-sm font-medium">Sign out</span> : null}
            {isDesktopSidebarCollapsed ? (
              <div className="absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap">
                Sign out
              </div>
            ) : null}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header (Dark Theme) */}
        <header className="relative z-[45] h-16 shrink-0 items-center justify-between border-b border-gray-800 bg-[#111827] px-3 sm:px-6 flex">
          <div className="flex min-w-0 items-center flex-1">
            <button 
              className="md:hidden p-2 mr-2 text-gray-400 hover:text-white"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              <Menu className="w-6 h-6" />
            </button>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            {isWalletEnabled ? (
              <div className="relative" ref={walletMenuRef}>
                <button
                  type="button"
                  onClick={() => {
                    setIsNotificationsOpen(false);
                    setIsAccountMenuOpen(false);
                    setIsWalletMenuOpen((current) => !current);
                  }}
                  className="relative inline-flex h-10 w-10 items-center justify-center rounded-2xl text-gray-400 transition hover:bg-gray-800 hover:text-white"
                  aria-expanded={isWalletMenuOpen}
                  aria-haspopup="menu"
                  aria-label="Open wallet"
                >
                  <Wallet className="h-5 w-5" />
                </button>

                <AnimatePresence>
                  {isWalletMenuOpen && wallet ? (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.95 }}
                      transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                      className="absolute right-0 top-full z-40 mt-3"
                    >
                      <WalletDropdown
                        wallet={wallet}
                        onBuyCredits={() => {
                          setIsWalletMenuOpen(false);
                          navigate('/dashboard/billing/wallet#buy-credits');
                        }}
                        onViewHistory={() => {
                          setIsWalletMenuOpen(false);
                          navigate('/dashboard/billing/wallet#usage-history');
                        }}
                      />
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            ) : null}

            <div className="relative" ref={notificationsRef}>
              <button
                type="button"
                onClick={() => {
                  setIsWalletMenuOpen(false);
                  setIsAccountMenuOpen(false);
                  setIsNotificationsOpen((current) => !current);
                }}
                className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-gray-400 transition hover:bg-gray-800 hover:text-white"
                aria-expanded={isNotificationsOpen}
                aria-haspopup="menu"
                aria-label="Open notifications"
              >
                <Bell className="h-5 w-5" />
                {unreadNotificationCount > 0 ? (
                  <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 bg-[#5b45ff] text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-[#111827]">
                    {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                  </span>
                ) : null}
              </button>

              <AnimatePresence>
                {isNotificationsOpen ? (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                    className="absolute right-0 top-full z-40 mt-3 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.18)]"
                  >
                    <div className="border-b border-gray-100 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-bold text-gray-900">Notifications</h3>
                          <p className="mt-0.5 text-xs text-gray-500">
                            {unreadNotificationCount > 0 ? `${unreadNotificationCount} unread` : 'All caught up'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleMarkAllNotificationsRead()}
                            disabled={unreadNotificationCount === 0}
                            className="rounded-lg px-2 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Mark read
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setIsNotificationsOpen(false);
                              navigate('/dashboard/notifications');
                            }}
                            className="rounded-lg px-2 py-1.5 text-xs font-semibold text-[#5b45ff] transition hover:bg-violet-50"
                          >
                            View all
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="max-h-[390px] overflow-y-auto bg-white">
                      <NotificationFeed
                        notifications={notifications.slice(0, 8)}
                        compact
                        onSelect={handleNotificationSelect}
                        onMarkRead={handleMarkNotificationRead}
                        emptyTitle="No recent notifications"
                        emptyDescription="New activity will appear here as your workspace updates."
                      />
                    </div>

                    <div className="sticky bottom-0 border-t border-gray-100 bg-white/95 px-3 py-3 backdrop-blur">
                      <button
                        type="button"
                        onClick={() => {
                          setIsNotificationsOpen(false);
                          navigate('/dashboard/notifications');
                        }}
                        className="w-full rounded-2xl bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 active:scale-[0.98]"
                      >
                        View all notifications
                      </button>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
            
            <div className="relative border-l border-gray-800 pl-3 sm:pl-4" ref={accountMenuRef}>
              <button
                type="button"
                onClick={() => {
                  setIsWalletMenuOpen(false);
                  setIsNotificationsOpen(false);
                  setIsAccountMenuOpen((current) => !current);
                }}
                className="flex items-center gap-3 rounded-2xl px-2 py-1.5 text-left transition hover:bg-gray-800/80"
                aria-expanded={isAccountMenuOpen}
                aria-haspopup="menu"
              >
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium text-white leading-tight">
                    {displayName}
                  </p>
                  <p className="text-xs text-gray-500 truncate max-w-[150px]">
                    {displaySecondaryText}
                  </p>
                </div>
                <UserAvatar
                  name={displayName}
                  imageUrl={displayProfilePictureUrl}
                  className="h-8 w-8 border border-gray-700 shadow-sm"
                  initialsClassName="text-xs font-bold"
                />
                <ChevronDown
                  className={`hidden h-4 w-4 text-gray-500 transition sm:block ${
                    isAccountMenuOpen ? 'rotate-180 text-white' : ''
                  }`}
                />
              </button>

              <AnimatePresence>
                {isAccountMenuOpen ? (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.98 }}
                    className="absolute right-0 top-full z-40 mt-3 w-[260px] overflow-hidden rounded-[26px] border border-gray-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.18)]"
                  >
                    <div className="border-b border-gray-100 bg-[#f8fafc] px-5 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Account</p>
                      <p className="mt-2 text-sm font-semibold text-gray-900">{displayName}</p>
                      <p className="mt-1 truncate text-sm text-gray-500">{displaySecondaryText}</p>
                    </div>

                    <div className="p-3">
                      <button
                        type="button"
                        onClick={() => {
                          setIsAccountMenuOpen(false);
                          navigate('/dashboard/settings');
                        }}
                        className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                      >
                        <Settings className="h-4 w-4 text-gray-400" />
                        <span>Settings</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsAccountMenuOpen(false);
                          setIsSignOutModalOpen(true);
                        }}
                        className="mt-1 flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-red-600 transition hover:bg-red-50"
                      >
                        <LogOut className="h-4 w-4 text-red-500" />
                        <span>Sign out</span>
                      </button>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Main Content Scrollable Area */}
        <main className="dashboard-main relative flex-1 overflow-auto p-3 sm:p-6 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-6">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -left-16 top-0 h-72 w-72 rounded-full bg-[#dbe8ff]/75 blur-3xl" />
            <div className="absolute right-[-4rem] top-20 h-96 w-96 rounded-full bg-[#d7f5ec]/65 blur-3xl" />
            <div className="absolute inset-x-0 top-0 h-44 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(255,255,255,0))]" />
          </div>

          <div className="dashboard-page-stack relative z-10">
            {showFinishOnboardingCta ? (
              <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-900 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold">WhatsApp is still disconnected.</p>
                  <p className="text-sm text-amber-800">
                    Finish onboarding to connect your real WhatsApp account and unlock live inbox, templates, and channel status.
                  </p>
                </div>
                <button
                  onClick={() => navigate('/onboarding/channel-connection')}
                  className="inline-flex items-center justify-center rounded-xl bg-amber-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-amber-950"
                >
                  Finish onboarding
                </button>
              </div>
            ) : null}
            <Outlet />
          </div>
        </main>
      </div>

      <AnimatePresence>
        {isMobileMenuOpen ? (
          <div className="fixed inset-0 z-50 md:hidden">
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
              aria-label="Close mobile menu"
            />

            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="relative z-10 flex h-full w-[min(88vw,22rem)] flex-col bg-[#111827] text-gray-300 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-gray-800 px-4 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <BrandMark className="h-9 w-9 shrink-0" />
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold text-white">Connektly</p>
                    <p className="truncate text-xs text-gray-500">{displaySecondaryText}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-gray-400 transition hover:bg-gray-800 hover:text-white"
                  aria-label="Close mobile menu"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="border-b border-gray-800 px-4 py-4">
                <div className="flex items-center gap-3 rounded-2xl border border-gray-800 bg-gray-900/70 px-3 py-3">
                  <UserAvatar
                    name={displayName}
                    imageUrl={displayProfilePictureUrl}
                    className="h-10 w-10 border border-gray-700"
                    initialsClassName="text-sm font-bold"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{displayName}</p>
                    <p className="truncate text-xs text-gray-500">{user?.email || displaySecondaryText}</p>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-3 py-4 scrollbar-hide">
                <nav className="space-y-1">
                  {navStructure.map((item) => {
                    if (item.type === 'link') {
                      const isExternalLink = item.path.startsWith('http');
                      const isActive = isExternalLink ? false : isNavItemActive(item);

                      if (isExternalLink) {
                        return (
                          <a
                            key={item.id}
                            href={item.path}
                            target="_blank"
                            rel="noreferrer"
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium text-gray-300 transition hover:bg-gray-800 hover:text-white"
                          >
                            <item.icon className="h-5 w-5 shrink-0 text-gray-400" />
                            <span className="truncate">{item.label}</span>
                          </a>
                        );
                      }

                      return (
                        <NavLink
                          key={item.id}
                          to={item.path!}
                          onClick={() => setIsMobileMenuOpen(false)}
                          className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition ${
                            isActive
                              ? 'bg-[#5b45ff] text-white'
                              : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                          }`}
                        >
                          <item.icon className={`h-5 w-5 shrink-0 ${isActive ? 'text-white' : 'text-gray-400'}`} />
                          <span className="truncate">{item.label}</span>
                        </NavLink>
                      );
                    }

                    if (item.type === 'dropdown') {
                      const isChildActive = item.children.some((child) => isNavItemActive(child));

                      return (
                        <div key={item.id} className="space-y-1">
                          <button
                            type="button"
                            onClick={item.toggle}
                            className={`flex w-full items-center justify-between rounded-2xl px-3 py-3 text-sm font-medium transition ${
                              isChildActive
                                ? 'bg-gray-800 text-white'
                                : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                            }`}
                          >
                            <span className="flex min-w-0 items-center gap-3">
                              <item.icon className="h-5 w-5 shrink-0 text-gray-400" />
                              <span className="truncate">{item.label}</span>
                            </span>
                            {item.isOpen ? (
                              <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />
                            ) : (
                              <ChevronRight className="h-4 w-4 shrink-0 text-gray-500" />
                            )}
                          </button>

                          <AnimatePresence initial={false}>
                            {item.isOpen ? (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="space-y-1 pl-4">
                                  {item.children.map((child, childIndex) => {
                                    const isActive = isNavItemActive(child);
                                    const shouldShowSectionLabel =
                                      child.sectionLabel &&
                                      item.children[childIndex - 1]?.sectionLabel !== child.sectionLabel;

                                    return (
                                      <Fragment key={child.path}>
                                        {shouldShowSectionLabel ? (
                                          <div className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-600">
                                            {child.sectionLabel}
                                          </div>
                                        ) : null}
                                        <NavLink
                                          to={child.path}
                                          onClick={() => setIsMobileMenuOpen(false)}
                                          className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition ${
                                            isActive
                                              ? 'bg-[#5b45ff] text-white'
                                              : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                                          }`}
                                        >
                                          <child.icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-white' : 'text-gray-500'}`} />
                                          <span className="truncate">{child.label}</span>
                                        </NavLink>
                                      </Fragment>
                                    );
                                  })}
                                </div>
                              </motion.div>
                            ) : null}
                          </AnimatePresence>
                        </div>
                      );
                    }

                    return null;
                  })}
                </nav>
              </div>

              <div className="space-y-1 border-t border-gray-800 p-3">
                <NavLink
                  to="/dashboard/settings"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium text-gray-300 transition hover:bg-gray-800 hover:text-white"
                >
                  <Settings className="h-5 w-5 shrink-0 text-gray-400" />
                  <span>Settings</span>
                </NavLink>
                <a
                  href={HELP_CENTER_URL}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium text-gray-300 transition hover:bg-gray-800 hover:text-white"
                >
                  <HelpCircle className="h-5 w-5 shrink-0 text-gray-400" />
                  <span className="min-w-0 flex-1">Help and Support</span>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    setIsSignOutModalOpen(true);
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium text-gray-300 transition hover:bg-red-500/10 hover:text-red-400"
                >
                  <LogOut className="h-5 w-5 shrink-0" />
                  <span>Sign out</span>
                </button>
              </div>
            </motion.aside>
          </div>
        ) : null}
      </AnimatePresence>

      {/* Sign Out Confirmation Modal */}
      <AnimatePresence>
        {isSignOutModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSignOutModalOpen(false)}
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden relative z-10 p-6 text-center"
            >
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Sign out</h3>
              <p className="text-sm text-gray-500 mb-6">
                Are you sure you want to sign out of your account? You will need to log in again to access your dashboard.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setIsSignOutModalOpen(false)}
                  disabled={isSigningOut}
                  className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSignOut}
                  disabled={isSigningOut}
                  className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSigningOut ? 'Signing out' : 'Sign out'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {apiErrorNotice ? (
          <motion.div
            key={apiErrorNotice.id}
            role="alert"
            initial={{ opacity: 0, y: -14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -14, scale: 0.98 }}
            className="fixed right-4 top-4 z-[120] w-[min(440px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-red-200 bg-white shadow-2xl shadow-red-950/15"
          >
            <div className="flex items-start gap-3 bg-red-50 px-4 py-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-700">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-red-900">Action failed</p>
                    <p className="mt-0.5 text-xs font-medium text-red-700">
                      {apiErrorNotice.method} request returned {apiErrorNotice.status}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setApiErrorNotice(null);

                      if (apiErrorNoticeTimerRef.current) {
                        window.clearTimeout(apiErrorNoticeTimerRef.current);
                        apiErrorNoticeTimerRef.current = null;
                      }
                    }}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-red-700 transition hover:bg-red-100"
                    aria-label="Dismiss error"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6 text-red-800">
                  {apiErrorNotice.message}
                </p>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <DashboardCallPopup />
    </div>
    </CallManagerProvider>
  );
}
