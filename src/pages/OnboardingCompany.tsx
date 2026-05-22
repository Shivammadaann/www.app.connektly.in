import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowRight, Building2, CheckCircle2, Globe, Loader2, Sparkles } from 'lucide-react';
import { useAppData } from '../context/AppDataContext';
import { appApi } from '../lib/api';
import FeedbackPopupStack from '../components/FeedbackPopupStack';
import OnboardingTopBar from '../components/OnboardingTopBar';

function FieldShell({
  label,
  helper,
  isValid,
  children,
}: {
  label: string;
  helper?: ReactNode;
  isValid?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs font-medium leading-4 text-gray-700">{label}</span>
        {isValid ? (
          <motion.span
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Looks good
          </motion.span>
        ) : null}
      </div>
      {children}
      {helper ? <div className="mt-2 text-xs leading-4 text-gray-500">{helper}</div> : null}
    </label>
  );
}

export default function OnboardingCompany() {
  const navigate = useNavigate();
  const { bootstrap, refresh } = useAppData();
  const companyNameInputRef = useRef<HTMLInputElement | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [companyWebsite, setCompanyWebsite] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCompanyName(bootstrap?.profile?.companyName || '');
    setCompanyWebsite(bootstrap?.profile?.companyWebsite || '');
  }, [bootstrap?.profile?.companyName, bootstrap?.profile?.companyWebsite]);

  const trimmedCompanyName = companyName.trim();
  const trimmedCompanyWebsite = companyWebsite.trim();
  const hasCompanyName = trimmedCompanyName !== '';
  const hasWebsiteValue = trimmedCompanyWebsite !== '';
  const isCompanyWebsiteValid = !hasWebsiteValue || /^(https?:\/\/|www\.)/i.test(trimmedCompanyWebsite);
  const showCompanyWebsiteError = hasWebsiteValue && !isCompanyWebsiteValid;
  const isFormValid = hasCompanyName && isCompanyWebsiteValid;
  const progressPercent = hasCompanyName ? (hasWebsiteValue && isCompanyWebsiteValid ? 100 : 72) : 28;
  const previewCompanyName = trimmedCompanyName || 'Your company';

  const saveCompanyDetails = async (websiteOverride?: string) => {
    const nextWebsite = websiteOverride ?? trimmedCompanyWebsite;

    if (!trimmedCompanyName || (nextWebsite && !/^(https?:\/\/|www\.)/i.test(nextWebsite))) {
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      await appApi.saveProfile({
        companyName: trimmedCompanyName,
        companyWebsite: nextWebsite,
      });
      await refresh();
      navigate('/onboarding/industry');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to save company details.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!isFormValid) {
      return;
    }

    await saveCompanyDetails();
  };

  const handleSkipWebsite = async () => {
    if (!trimmedCompanyName) {
      companyNameInputRef.current?.focus();
      return;
    }

    setCompanyWebsite('');
    await saveCompanyDetails('');
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-y-auto bg-[#F8FAFC] px-4 pb-10 pt-24 font-sans sm:px-8">
      <OnboardingTopBar />

      <motion.main
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
        className="relative z-10 w-full max-w-[520px]"
      >
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between text-xs font-medium text-gray-500">
            <span>Company setup</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-200">
            <motion.div
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className="h-full rounded-full bg-[#4F46E5]"
            />
          </div>
        </div>

        <div className="text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, delay: 0.06 }}
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-[#4F46E5]"
          >
            <Building2 className="h-7 w-7" />
          </motion.div>
          <h1 className="mt-6 text-[32px] font-semibold leading-10 tracking-tight text-gray-950">
            Let&apos;s get to know your company.
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-5 text-gray-500">
            We&apos;ll use this to personalize your workspace and prepare your WhatsApp setup.
          </p>
        </div>

        <FeedbackPopupStack
          items={error ? [{ id: 'onboarding-company-error', tone: 'error' as const, message: error, onDismiss: () => setError(null) }] : []}
        />

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <FieldShell
            label="Company name"
            isValid={hasCompanyName}
            helper={
              hasCompanyName ? (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="inline-flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-[#4F46E5]" />
                  Your workspace will be called <span className="font-medium text-gray-800">"{previewCompanyName}"</span>.
                </motion.span>
              ) : (
                'This becomes the workspace name your team sees.'
              )
            }
          >
            <div className="group relative">
              <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 transition group-focus-within:text-[#4F46E5]" />
              <input
                ref={companyNameInputRef}
                type="text"
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                placeholder="Connektly Solutions"
                autoFocus
                className="h-11 w-full rounded-lg border border-gray-200 bg-white pl-10 pr-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/15"
              />
            </div>
          </FieldShell>

          <FieldShell
            label="Website"
            isValid={hasWebsiteValue && isCompanyWebsiteValid}
            helper={
              showCompanyWebsiteError ? (
                <span id="company-website-error" className="text-red-600">
                  Website must start with https://, http://, or www.
                </span>
              ) : (
                'Optional. Add it now or skip and update it later in settings.'
              )
            }
          >
            <div className="group relative">
              <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 transition group-focus-within:text-[#4F46E5]" />
              <input
                type="text"
                inputMode="url"
                value={companyWebsite}
                onChange={(event) => setCompanyWebsite(event.target.value)}
                placeholder="https://example.com"
                aria-invalid={showCompanyWebsiteError}
                aria-describedby={showCompanyWebsiteError ? 'company-website-error' : undefined}
                className={`h-11 w-full rounded-lg border bg-white pl-10 pr-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:ring-2 ${
                  showCompanyWebsiteError
                    ? 'border-red-300 focus:border-red-500 focus:ring-red-500/15'
                    : 'border-gray-200 focus:border-[#4F46E5] focus:ring-[#4F46E5]/15'
                }`}
              />
            </div>
          </FieldShell>

          <div className="flex flex-col gap-3 pt-2 sm:flex-row">
            <motion.button
              type="submit"
              whileHover={isFormValid && !isSaving ? { y: -1 } : undefined}
              whileTap={isFormValid && !isSaving ? { scale: 0.98 } : undefined}
              disabled={!isFormValid || isSaving}
              className={`inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition ${
                isFormValid && !isSaving
                  ? 'bg-[#4F46E5] text-white shadow-lg shadow-indigo-500/20 hover:bg-[#4338CA]'
                  : 'cursor-not-allowed bg-gray-200 text-gray-500'
              }`}
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Continue to Industry
              {!isSaving ? <ArrowRight className="h-4 w-4" /> : null}
            </motion.button>

            <button
              type="button"
              onClick={() => void handleSkipWebsite()}
              disabled={!hasCompanyName || isSaving}
              className="h-12 rounded-xl px-4 text-sm font-semibold text-gray-500 transition hover:bg-white hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Skip website
            </button>
          </div>

          <p className="text-center text-xs leading-4 text-gray-400">
            Quick step. Takes about 10 seconds.
          </p>
        </form>
      </motion.main>
    </div>
  );
}
