import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowRight,
  Briefcase,
  BriefcaseBusiness,
  Check,
  GraduationCap,
  HeartPulse,
  Home,
  Laptop,
  Loader2,
  Search,
  Sparkles,
  Store,
  Truck,
  Utensils,
  type LucideIcon,
} from 'lucide-react';
import { appApi } from '../lib/api';
import { useAppData } from '../context/AppDataContext';
import FeedbackPopupStack from '../components/FeedbackPopupStack';
import OnboardingTopBar from '../components/OnboardingTopBar';

type IndustryOption = {
  label: string;
  description: string;
  icon: LucideIcon;
  preview: string;
};

const INDUSTRIES: IndustryOption[] = [
  {
    label: 'Retail and e-commerce',
    description: 'Sell products online or offline',
    icon: Store,
    preview: 'Product replies, cart follow-ups, buyer labels, and repeat purchase workflows.',
  },
  {
    label: 'Healthcare, beauty and wellness',
    description: 'Appointments, services, clinics, salons',
    icon: HeartPulse,
    preview: 'Appointment reminders, client profiles, follow-up tasks, and service inquiries.',
  },
  {
    label: 'Professional Services',
    description: 'Consultants, agencies, legal, finance',
    icon: BriefcaseBusiness,
    preview: 'Lead qualification, proposal tracking, consultation notes, and owner assignment.',
  },
  {
    label: 'Technology and Software',
    description: 'SaaS, apps, and software services',
    icon: Laptop,
    preview: 'Demo requests, support routing, account conversations, and onboarding templates.',
  },
  {
    label: 'Food and Beverage',
    description: 'Restaurants, cloud kitchens, cafes',
    icon: Utensils,
    preview: 'Order conversations, menu inquiries, delivery updates, and customer callbacks.',
  },
  {
    label: 'Education and Training',
    description: 'Courses, institutes, coaching, schools',
    icon: GraduationCap,
    preview: 'Admissions leads, course inquiries, student follow-ups, and batch reminders.',
  },
  {
    label: 'Real Estate',
    description: 'Property sales, rentals, brokers',
    icon: Home,
    preview: 'Property leads, site visits, buyer intent labels, and callback reminders.',
  },
  {
    label: 'Manufacturing and Logistics',
    description: 'Suppliers, distributors, dispatch teams',
    icon: Truck,
    preview: 'Dispatch updates, distributor leads, service requests, and operations labels.',
  },
  {
    label: 'Other',
    description: 'Use flexible defaults for any team',
    icon: Sparkles,
    preview: 'Flexible inbox labels, starter templates, and workspace defaults for your team.',
  },
];

const PRIMARY_INDUSTRY_COUNT = 6;

export default function OnboardingIndustry() {
  const navigate = useNavigate();
  const { bootstrap, refresh } = useAppData();
  const [selectedIndustry, setSelectedIndustry] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedIndustry(bootstrap?.profile?.industry || '');
  }, [bootstrap?.profile?.industry]);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const selectedIndustryDetails =
    INDUSTRIES.find((industry) => industry.label === selectedIndustry) || null;
  const visibleIndustries = useMemo(() => {
    const source = normalizedSearchQuery || showMore ? INDUSTRIES : INDUSTRIES.slice(0, PRIMARY_INDUSTRY_COUNT);

    if (!normalizedSearchQuery) {
      return source;
    }

    return INDUSTRIES.filter((industry) => {
      const content = `${industry.label} ${industry.description}`.toLowerCase();
      return content.includes(normalizedSearchQuery);
    });
  }, [normalizedSearchQuery, showMore]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!selectedIndustry) {
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      await appApi.saveProfile({
        industry: selectedIndustry,
      });
      await refresh();
      navigate('/onboarding/profile');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to save your industry.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkip = async () => {
    setSelectedIndustry('Other');

    try {
      setIsSaving(true);
      setError(null);
      await appApi.saveProfile({
        industry: 'Other',
      });
      await refresh();
      navigate('/onboarding/profile');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to save your industry.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-y-auto bg-[#F8FAFC] px-4 pb-10 pt-24 font-sans sm:px-8">
      <OnboardingTopBar />

      <motion.main
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
        className="relative z-10 w-full max-w-[760px]"
      >
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#4F46E5]">Step 3 of 5</p>
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, delay: 0.05 }}
            className="mx-auto mt-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-[#4F46E5]"
          >
            <Briefcase className="h-7 w-7" />
          </motion.div>
          <h1 className="mt-6 text-[32px] font-semibold leading-10 tracking-tight text-gray-950">
            What kind of business are you building?
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-5 text-gray-500">
            We&apos;ll tailor templates, CRM labels, automations, and workspace defaults around your industry.
          </p>
        </div>

        <FeedbackPopupStack
          items={error ? [{ id: 'onboarding-industry-error', tone: 'error' as const, message: error, onDismiss: () => setError(null) }] : []}
        />

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setShowMore(true);
              }}
              placeholder="Search your industry..."
              className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/15"
            />
          </div>

          <motion.div layout className="grid gap-4 md:grid-cols-2">
            <AnimatePresence mode="popLayout">
              {visibleIndustries.map((industry, index) => {
                const Icon = industry.icon;
                const isSelected = selectedIndustry === industry.label;

                return (
                  <motion.button
                    key={industry.label}
                    type="button"
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: isSelected || !selectedIndustry ? 1 : 0.72, y: 0, scale: isSelected ? 1.02 : 1 }}
                    exit={{ opacity: 0, y: 8 }}
                    whileHover={{ y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ delay: index * 0.025, duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                    onClick={() => {
                      setSelectedIndustry(industry.label);
                      setError(null);
                    }}
                    className={`relative rounded-2xl border p-4 text-left transition ${
                      isSelected
                        ? 'border-[#4F46E5] bg-indigo-50 shadow-[0_16px_36px_rgba(79,70,229,0.12)]'
                        : 'border-gray-200 bg-white shadow-sm hover:border-gray-300 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        isSelected ? 'bg-[#4F46E5] text-white' : 'bg-gray-100 text-gray-500'
                      }`}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-gray-950">{industry.label}</span>
                        <span className="mt-1 block text-xs leading-4 text-gray-500">{industry.description}</span>
                      </span>
                      {isSelected ? (
                        <motion.span
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#4F46E5] text-white"
                        >
                          <Check className="h-3.5 w-3.5" strokeWidth={3} />
                        </motion.span>
                      ) : null}
                    </div>
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </motion.div>

          {!normalizedSearchQuery && INDUSTRIES.length > PRIMARY_INDUSTRY_COUNT ? (
            <div className="text-center">
              <button
                type="button"
                onClick={() => setShowMore((current) => !current)}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-[#4F46E5] transition hover:bg-indigo-50 hover:text-[#4338CA]"
              >
                {showMore ? 'Show fewer' : 'Show more industries'}
              </button>
            </div>
          ) : null}

          <AnimatePresence mode="wait">
            {selectedIndustryDetails ? (
              <motion.div
                key={selectedIndustryDetails.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                className="rounded-3xl border border-indigo-100 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#4F46E5] text-white">
                    <selectedIndustryDetails.icon className="h-6 w-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-950">We&apos;ll tailor your workspace for {selectedIndustryDetails.label}</p>
                    <p className="mt-1 text-sm leading-5 text-gray-500">{selectedIndustryDetails.preview}</p>
                    <div className="mt-4 grid gap-2 sm:grid-cols-3">
                      {['Recommended templates', 'CRM labels', 'Automation flows'].map((item) => (
                        <div key={item} className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600">
                          <Check className="h-3.5 w-3.5 text-emerald-500" strokeWidth={3} />
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <AnimatePresence>
            {selectedIndustry ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                className="flex flex-col gap-3 sm:flex-row sm:items-center"
              >
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#4F46E5] text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:-translate-y-0.5 hover:bg-[#4338CA] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Continue to Profile
                  {!isSaving ? <ArrowRight className="h-4 w-4" /> : null}
                </button>
                <button
                  type="button"
                  onClick={() => void handleSkip()}
                  disabled={isSaving}
                  className="h-12 rounded-xl px-4 text-sm font-semibold text-gray-500 transition hover:bg-white hover:text-gray-900 disabled:opacity-50"
                >
                  Not sure yet
                </button>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col gap-3 sm:flex-row sm:items-center"
              >
                <button
                  type="button"
                  disabled
                  className="inline-flex h-12 flex-1 cursor-not-allowed items-center justify-center rounded-xl bg-gray-200 text-sm font-semibold text-gray-500"
                >
                  Select an industry to continue
                </button>
                <button
                  type="button"
                  onClick={() => void handleSkip()}
                  disabled={isSaving}
                  className="h-12 rounded-xl px-4 text-sm font-semibold text-gray-500 transition hover:bg-white hover:text-gray-900 disabled:opacity-50"
                >
                  Not sure yet
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </form>
      </motion.main>
    </div>
  );
}
