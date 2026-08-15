import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Globe,
  HelpCircle,
  Image,
  Info,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  ShieldCheck,
  X,
} from 'lucide-react';
import { appApi } from '../lib/api';
import { hasEmbeddedSignupConfig } from '../lib/config';
import { beginEmbeddedSignup } from '../lib/meta-sdk';
import { useAppData } from '../context/AppDataContext';
import OnboardingTopBar from '../components/OnboardingTopBar';
import ChannelBrandIcon from '../components/ChannelBrandIcon';
import {
  FormField,
  FormSection,
  OnboardingStepLayout,
  StepCTA,
  onboardingMotion,
} from '../components/onboarding/OnboardingStepPrimitives';
import type { DashboardBootstrap, MetaChannelConnection, WhatsAppBusinessProfile } from '../lib/types';
import facebookIconUrl from '../assets/Facebook.svg';
import defaultProfilePictureUrl from '../assets/profile.png';

const DEFAULT_WHATSAPP_SETUP_TYPE = 'exclusive' as const;

type OnboardingBusinessProfileFormState = {
  description: string;
  about: string;
  email: string;
  address: string;
  website: string;
};

function buildBusinessProfileForm(
  profile: WhatsAppBusinessProfile | null,
  bootstrap: DashboardBootstrap | null,
): OnboardingBusinessProfileFormState {
  return {
    description: profile?.description || '',
    about: profile?.about || '',
    email: profile?.email || bootstrap?.profile?.email || '',
    address: profile?.address || '',
    website: profile?.websites[0] || bootstrap?.profile?.companyWebsite || '',
  };
}

function getBusinessProfilePreviewName(
  profile: WhatsAppBusinessProfile | null,
  bootstrap: DashboardBootstrap | null,
) {
  return (
    profile?.verifiedName ||
    profile?.businessAccountName ||
    bootstrap?.channel?.verifiedName ||
    bootstrap?.profile?.companyName ||
    'Business Profile'
  );
}

function StatusMessage({
  tone,
  children,
}: {
  tone: 'error' | 'success' | 'warning' | 'info';
  children: ReactNode;
}) {
  const toneClassName =
    tone === 'error'
      ? 'border-red-100 bg-red-50 text-red-700'
      : tone === 'success'
        ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
        : tone === 'warning'
          ? 'border-amber-100 bg-amber-50 text-amber-900'
          : 'border-blue-100 bg-blue-50 text-blue-800';

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
      className={`rounded-2xl border px-4 py-3 text-sm ${toneClassName}`}
    >
      {children}
    </motion.div>
  );
}

function SetupStepRow({
  index,
  title,
  description,
  isComplete,
  isActive,
}: {
  index: number;
  title: string;
  description: string;
  isComplete?: boolean;
  isActive?: boolean;
}) {
  return (
    <motion.div
      {...onboardingMotion.slideUp}
      className={`flex items-start gap-3 rounded-2xl border px-4 py-3 transition ${
        isActive
          ? 'border-sky-100 bg-sky-50/70'
          : isComplete
            ? 'border-emerald-100 bg-emerald-50/60'
            : 'border-gray-200 bg-white'
      }`}
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
          isComplete
            ? 'bg-emerald-500 text-white'
            : isActive
              ? 'bg-[#1381FF] text-white'
              : 'bg-gray-100 text-gray-500'
        }`}
      >
        {isComplete ? <CheckCircle2 className="h-4 w-4" /> : index}
      </span>
      <span>
        <span className="block text-sm font-semibold text-gray-950">{title}</span>
        <span className="mt-0.5 block text-xs leading-4 text-gray-500">{description}</span>
      </span>
    </motion.div>
  );
}

function RequirementChoice({
  selected,
  tone = 'primary',
  children,
  onClick,
}: {
  selected: boolean;
  tone?: 'primary' | 'danger' | 'neutral';
  children: ReactNode;
  onClick: () => void;
}) {
  const selectedClassName =
    tone === 'danger'
      ? 'border-red-500 bg-red-500 text-white'
      : tone === 'neutral'
        ? 'border-gray-800 bg-gray-800 text-white'
        : 'border-[#1381FF] bg-[#1381FF] text-white';

  return (
    <motion.button
      type="button"
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`h-10 rounded-xl border px-4 text-sm font-semibold transition ${
        selected ? selectedClassName : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
      }`}
    >
      {children}
    </motion.button>
  );
}

function BusinessProfileImage({
  src,
  name,
  className = 'h-16 w-16',
}: {
  src: string | null;
  name: string;
  className?: string;
}) {
  return (
    <img
      src={src || defaultProfilePictureUrl}
      alt={src ? name : `${name} default profile`}
      className={`${className} rounded-full object-cover shadow-sm`}
      draggable={false}
      onError={(event) => {
        event.currentTarget.src = defaultProfilePictureUrl;
      }}
    />
  );
}

const modalSteps = [
  ['Requirements', 'Confirm access'],
  ['Connect', 'Facebook or manual'],
  ['Profile', 'Public details'],
  ['Ready', 'Finish setup'],
] as const;

export default function ChannelConnection() {
  const navigate = useNavigate();
  const {
    bootstrap,
    businessProfile,
    refresh,
    refreshBusinessProfile,
    setBusinessProfile,
  } = useAppData();
  const totalSteps = 4;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [hasAdmin, setHasAdmin] = useState<boolean | null>(null);
  const [has2FADisabled, setHas2FADisabled] = useState<boolean | null>(null);
  const [connectMethod, setConnectMethod] = useState<'manual' | null>(null);
  const [manualData, setManualData] = useState({ token: '', wabaId: '', phoneId: '' });
  const [isConnecting, setIsConnecting] = useState(false);
  const [pendingChannel, setPendingChannel] = useState<MetaChannelConnection | null>(null);
  const [isRegisteringSender, setIsRegisteringSender] = useState(false);
  const [businessProfileForm, setBusinessProfileForm] = useState<OnboardingBusinessProfileFormState>(
    () => buildBusinessProfileForm(null, bootstrap),
  );
  const [isBusinessProfileDirty, setIsBusinessProfileDirty] = useState(false);
  const [isSavingBusinessProfile, setIsSavingBusinessProfile] = useState(false);
  const [isUploadingBusinessPhoto, setIsUploadingBusinessPhoto] = useState(false);
  const [businessPhotoPreviewUrl, setBusinessPhotoPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const businessPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const manualTokenInputRef = useRef<HTMLInputElement | null>(null);

  const existingChannel = bootstrap?.channel || null;
  const onboardingChannel = pendingChannel || existingChannel;
  const requirementsReady = hasAdmin === true && has2FADisabled !== null;
  const manualConnectionReady =
    manualData.token.trim() !== '' && manualData.wabaId.trim() !== '' && manualData.phoneId.trim() !== '';
  const businessProfilePreviewName = getBusinessProfilePreviewName(businessProfile, bootstrap);
  const businessProfilePreviewSummary =
    businessProfileForm.description.trim() ||
    businessProfileForm.about.trim() ||
    'Add a short business description that customers can see on WhatsApp.';
  const businessProfilePreviewWebsite = businessProfileForm.website.trim();
  const businessProfilePreviewEmail = businessProfileForm.email.trim();
  const businessProfilePreviewAddress = businessProfileForm.address.trim();
  const businessProfilePhotoUrl = businessPhotoPreviewUrl || businessProfile?.profilePictureUrl || null;
  const businessProfileCompletion = useMemo(() => {
    const completedItems = [
      businessProfilePhotoUrl,
      businessProfileForm.description.trim(),
      businessProfileForm.about.trim(),
      businessProfileForm.email.trim(),
      businessProfileForm.website.trim(),
      businessProfileForm.address.trim(),
    ].filter(Boolean).length;

    return Math.max(18, Math.round((completedItems / 6) * 100));
  }, [businessProfileForm, businessProfilePhotoUrl]);
  const primaryActionLabel = useMemo(() => {
    if (!existingChannel) {
      return 'Connect WhatsApp';
    }

    return existingChannel.displayPhoneNumber
      ? `Connected: ${existingChannel.displayPhoneNumber}`
      : 'WhatsApp connected';
  }, [existingChannel]);

  useEffect(() => {
    if (isBusinessProfileDirty) {
      return;
    }

    setBusinessProfileForm(buildBusinessProfileForm(businessProfile, bootstrap));
    setBusinessPhotoPreviewUrl(businessProfile?.profilePictureUrl || null);
  }, [bootstrap, businessProfile, isBusinessProfileDirty]);

  useEffect(() => {
    if (connectMethod === 'manual') {
      manualTokenInputRef.current?.focus();
    }
  }, [connectMethod]);

  useEffect(() => {
    if (!businessPhotoPreviewUrl?.startsWith('blob:')) {
      return;
    }

    return () => {
      URL.revokeObjectURL(businessPhotoPreviewUrl);
    };
  }, [businessPhotoPreviewUrl]);

  const resetModal = () => {
    setStep(1);
    setHasAdmin(null);
    setHas2FADisabled(null);
    setConnectMethod(null);
    setManualData({ token: '', wabaId: '', phoneId: '' });
    setPendingChannel(null);
    setError(null);
    setSuccess(null);
    setIsConnecting(false);
    setIsRegisteringSender(false);
    setIsBusinessProfileDirty(false);
    setIsSavingBusinessProfile(false);
    setIsUploadingBusinessPhoto(false);
    setBusinessPhotoPreviewUrl(businessProfile?.profilePictureUrl || null);
    setBusinessProfileForm(buildBusinessProfileForm(businessProfile, bootstrap));
    setIsModalOpen(false);
  };

  const finishOnboarding = async () => {
    await appApi.saveProfile({
      onboardingCompleted: true,
    });
    await refresh();
    navigate('/onboarding/plans');
  };

  const activateSenderWithGeneratedPin = async (failurePrefix: string) => {
    try {
      setIsRegisteringSender(true);
      setError(null);
      setSuccess(null);
      const response = await appApi.registerMetaSender();
      setPendingChannel(response.channel);
      setSuccess(null);
      await refresh();
      await refreshBusinessProfile({ silent: true }).catch(() => null);
      setStep(3);
    } catch (nextError) {
      try {
        await refresh();
      } catch {
        // Keep the activation failure visible even if bootstrap refresh also fails.
      }
      setError(
        nextError instanceof Error
          ? `${failurePrefix}: ${nextError.message}`
          : `${failurePrefix}.`,
      );
    } finally {
      setIsRegisteringSender(false);
    }
  };

  const handleBusinessProfileFieldChange = (
    field: keyof OnboardingBusinessProfileFormState,
    value: string,
  ) => {
    setIsBusinessProfileDirty(true);
    setError(null);
    setSuccess(null);
    setBusinessProfileForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleBusinessProfilePhotoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setError('Business profile photo must be a PNG or JPEG image.');
      setSuccess(null);
      input.value = '';
      return;
    }

    setError(null);
    setSuccess(null);
    setIsUploadingBusinessPhoto(true);
    setBusinessPhotoPreviewUrl(URL.createObjectURL(file));

    try {
      const response = await appApi.uploadBusinessProfilePhoto(file);
      setBusinessProfile(() => response.profile);
      setBusinessPhotoPreviewUrl(response.profile.profilePictureUrl || null);
      setSuccess('Business profile photo updated.');
    } catch (nextError) {
      setBusinessPhotoPreviewUrl(businessProfile?.profilePictureUrl || null);
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Failed to upload the business profile photo.',
      );
    } finally {
      setIsUploadingBusinessPhoto(false);
      input.value = '';
    }
  };

  const handleSaveBusinessProfile = async () => {
    try {
      setIsSavingBusinessProfile(true);
      setError(null);
      setSuccess(null);

      const response = await appApi.updateBusinessProfile({
        description: businessProfileForm.description,
        about: businessProfileForm.about,
        email: businessProfileForm.email,
        address: businessProfileForm.address,
        websites: businessProfileForm.website.trim() ? [businessProfileForm.website.trim()] : [],
      });

      setBusinessProfile(() => response.profile);
      setBusinessProfileForm(buildBusinessProfileForm(response.profile, bootstrap));
      setBusinessPhotoPreviewUrl(response.profile.profilePictureUrl || null);
      setIsBusinessProfileDirty(false);
      setStep(4);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Failed to save the WhatsApp Business Profile.',
      );
    } finally {
      setIsSavingBusinessProfile(false);
    }
  };

  const handleConnectMeta = async () => {
    try {
      setIsConnecting(true);
      setError(null);
      setSuccess(null);
      const embeddedSession = await beginEmbeddedSignup({ flowState: 'core_onboarding' });
      const response = await appApi.connectMetaEmbedded({
        setupType: DEFAULT_WHATSAPP_SETUP_TYPE,
        code: embeddedSession.code,
        wabaId: embeddedSession.wabaId,
        phoneNumberId: embeddedSession.phoneNumberId,
        redirectUri: embeddedSession.redirectUri,
        flowState: embeddedSession.flowState,
        oauthState: embeddedSession.oauthState,
        setupContext: embeddedSession.setupContext,
      });
      setPendingChannel(response.channel);
      setSuccess(null);
      setIsConnecting(false);
      await activateSenderWithGeneratedPin('Meta connected, but automatic WhatsApp activation failed');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Meta connection failed.');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleManualSubmit = async (event: FormEvent) => {
    event.preventDefault();

    try {
      setIsConnecting(true);
      setError(null);
      setSuccess(null);
      const response = await appApi.connectMetaManually({
        setupType: DEFAULT_WHATSAPP_SETUP_TYPE,
        accessToken: manualData.token.trim(),
        wabaId: manualData.wabaId.trim(),
        phoneNumberId: manualData.phoneId.trim(),
      });
      setPendingChannel(response.channel);
      setSuccess(null);
      setIsConnecting(false);
      await activateSenderWithGeneratedPin('Meta connected, but automatic WhatsApp activation failed');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Manual Meta connection failed.');
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-y-auto bg-[#F8FAFC] px-4 pb-10 pt-24 font-sans sm:px-8">
      <OnboardingTopBar />

      <OnboardingStepLayout
        eyebrow="Step 3 of 4"
        title="Connect WhatsApp Business."
        description="Connect now to sync live templates and inbox status, or skip and finish setup from Connections later."
        icon={<ChannelBrandIcon channel="whatsapp" className="h-8 w-8" alt="" />}
        progressLabel="WhatsApp setup"
        progressValue={existingChannel ? 100 : 84}
        maxWidthClassName="max-w-[620px]"
      >
        <div className="mt-8 space-y-5">
          <FormSection>
            <div className="flex items-start gap-4">
              <ChannelBrandIcon channel="whatsapp" className="h-14 w-14 shrink-0" alt="" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-gray-950">WhatsApp Business</h2>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium ${
                      existingChannel ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        existingChannel ? 'bg-emerald-500' : 'bg-gray-400'
                      }`}
                    />
                    {existingChannel ? 'Connected' : 'Not connected'}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-5 text-gray-500">
                  {existingChannel
                    ? primaryActionLabel
                    : 'Facebook embedded signup is the fastest path. Manual setup is still available inside the flow.'}
                  {existingChannel?.verifiedName ? ` - ${existingChannel.verifiedName}` : ''}
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3">
              <SetupStepRow
                index={1}
                title="Confirm Meta access"
                description="Admin access and migration readiness."
                isComplete={existingChannel !== null}
                isActive={!existingChannel}
              />
              <SetupStepRow
                index={2}
                title="Connect with Facebook"
                description="Secure embedded signup or manual credentials."
                isComplete={existingChannel !== null}
              />
              <SetupStepRow
                index={3}
                title="Review public profile"
                description="Optional details customers see on WhatsApp."
                isComplete={existingChannel !== null}
              />
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <StepCTA
                type="button"
                variant="success"
                onClick={() => setIsModalOpen(true)}
                icon={<ArrowRight className="h-4 w-4" />}
                className="flex-1"
              >
                {existingChannel ? 'Manage WhatsApp Setup' : 'Connect WhatsApp'}
              </StepCTA>
              <StepCTA
                type="button"
                variant="secondary"
                onClick={() => void finishOnboarding()}
                className="flex-1"
              >
                Skip and choose plan
              </StepCTA>
            </div>
          </FormSection>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, delay: 0.08 }}
            className="flex flex-wrap justify-center gap-2 text-xs text-gray-500"
          >
            {[
              [Calendar, 'Book setup call'],
              [MessageCircle, 'Talk to support'],
              [HelpCircle, 'Read setup docs'],
            ].map(([Icon, label]) => {
              const HelpIcon = Icon as typeof Calendar;

              return (
                <button
                  key={label as string}
                  type="button"
                  className="inline-flex h-9 items-center gap-2 rounded-full border border-gray-200 bg-white px-3 font-medium transition hover:bg-gray-50 hover:text-gray-900"
                >
                  <HelpIcon className="h-3.5 w-3.5" />
                  {label as string}
                </button>
              );
            })}
          </motion.div>
        </div>
      </OnboardingStepLayout>

      <AnimatePresence>
        {isModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={resetModal}
              className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 12 }}
              transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
              className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
            >
              <div className="sticky top-0 z-20 border-b border-gray-100 bg-white px-5 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <ChannelBrandIcon channel="whatsapp" className="h-10 w-10 shrink-0" alt="" />
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-semibold text-gray-950">WhatsApp setup</h2>
                      <p className="text-xs text-gray-500">Step {step} of {totalSteps}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={resetModal}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                    aria-label="Close WhatsApp setup"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-4">
                  {modalSteps.map(([title, description], index) => {
                    const stepNumber = index + 1;
                    const isActive = stepNumber === step;
                    const isComplete = stepNumber < step;

                    return (
                      <div key={title} className="min-w-0">
                        <div
                          className={`h-1 rounded-full transition ${
                            isComplete || isActive ? 'bg-[#1381FF]' : 'bg-gray-200'
                          }`}
                        />
                        <p
                          className={`mt-2 truncate text-xs font-semibold ${
                            isActive ? 'text-gray-950' : isComplete ? 'text-[#1381FF]' : 'text-gray-400'
                          }`}
                        >
                          {title}
                        </p>
                        <p className="hidden truncate text-[11px] text-gray-400 sm:block">{description}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto bg-[#F8FAFC] px-5 py-6">
                <AnimatePresence mode="wait">
                  {step === 1 ? (
                    <motion.div
                      key="step1"
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -12 }}
                      transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                      className="mx-auto max-w-xl space-y-5"
                    >
                      <div className="text-center">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-[#1381FF]">
                          <ShieldCheck className="h-6 w-6" />
                        </div>
                        <h3 className="mt-4 text-2xl font-semibold tracking-tight text-gray-950">Quick readiness check</h3>
                        <p className="mx-auto mt-2 max-w-md text-sm leading-5 text-gray-500">
                          Two answers help avoid failed Meta setup attempts.
                        </p>
                      </div>

                      <FormSection
                        title="Do you have admin access to the Meta Business Portfolio?"
                        description="Embedded signup and manual token setup require Meta admin access."
                      >
                        <div className="flex flex-wrap gap-2">
                          <RequirementChoice selected={hasAdmin === true} onClick={() => setHasAdmin(true)}>
                            Yes, I have access
                          </RequirementChoice>
                          <RequirementChoice
                            selected={hasAdmin === false}
                            tone="danger"
                            onClick={() => setHasAdmin(false)}
                          >
                            No
                          </RequirementChoice>
                        </div>

                        <AnimatePresence>
                          {hasAdmin === false ? (
                            <motion.div
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: 8 }}
                              className="mt-4 flex gap-3 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-800"
                            >
                              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                              Ask a Meta Business admin to complete this step or provide manual connection values.
                            </motion.div>
                          ) : null}
                        </AnimatePresence>
                      </FormSection>

                      <AnimatePresence>
                        {hasAdmin === true ? (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                          >
                            <FormSection
                              title="If you are migrating, is Meta two-factor authentication disabled for setup?"
                              description="Connektly generates a secure 2FA PIN during activation after the account connects."
                            >
                              <div className="flex flex-wrap gap-2">
                                <RequirementChoice
                                  selected={has2FADisabled === true}
                                  onClick={() => setHas2FADisabled(true)}
                                >
                                  Yes, ready
                                </RequirementChoice>
                                <RequirementChoice
                                  selected={has2FADisabled === false}
                                  tone="neutral"
                                  onClick={() => setHas2FADisabled(false)}
                                >
                                  Not migrating
                                </RequirementChoice>
                              </div>
                            </FormSection>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>

                      <StatusMessage tone="info">
                        <span className="flex gap-2">
                          <Info className="mt-0.5 h-4 w-4 shrink-0" />
                          Open Meta Business Suite, go to Settings, then People to confirm your role.
                        </span>
                      </StatusMessage>

                      <div className="flex justify-end">
                        <StepCTA
                          type="button"
                          disabled={!requirementsReady}
                          onClick={() => setStep(2)}
                          icon={<ArrowRight className="h-4 w-4" />}
                        >
                          Continue to WhatsApp
                        </StepCTA>
                      </div>
                    </motion.div>
                  ) : null}

                  {step === 2 ? (
                    <motion.div
                      key="step2"
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -12 }}
                      transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                      className="mx-auto max-w-xl space-y-5"
                    >
                      <div className="text-center">
                        <ChannelBrandIcon channel="whatsapp" className="mx-auto h-14 w-14" alt="" />
                        <h3 className="mt-4 text-2xl font-semibold tracking-tight text-gray-950">
                          Connect your WhatsApp Business Account
                        </h3>
                        <p className="mx-auto mt-2 max-w-md text-sm leading-5 text-gray-500">
                          Facebook embedded signup is fastest. Manual setup is available for advanced teams.
                        </p>
                      </div>

                      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
                      {success ? <StatusMessage tone="success">{success}</StatusMessage> : null}

                      {!connectMethod ? (
                        <div className="space-y-4">
                          <FormSection>
                            <StepCTA
                              type="button"
                              variant="facebook"
                              onClick={() => void handleConnectMeta()}
                              disabled={isConnecting || isRegisteringSender || !hasEmbeddedSignupConfig}
                              loading={isConnecting || isRegisteringSender}
                              icon={<img src={facebookIconUrl} alt="" className="h-5 w-5" />}
                              className="w-full"
                            >
                              {isRegisteringSender
                                ? 'Activating WhatsApp...'
                                : isConnecting
                                  ? 'Connecting...'
                                  : 'Continue with Facebook'}
                            </StepCTA>

                            <div className="mt-4 grid gap-2 text-xs text-gray-500 sm:grid-cols-3">
                              {['Secure Meta flow', 'Auto activation', 'No manual IDs'].map((item) => (
                                <div key={item} className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                  {item}
                                </div>
                              ))}
                            </div>

                            {!hasEmbeddedSignupConfig ? (
                              <p className="mt-4 text-xs leading-4 text-amber-700">
                                Facebook embedded signup is not configured yet. Use manual setup below.
                              </p>
                            ) : null}
                          </FormSection>

                          <div className="text-center">
                            <button
                              type="button"
                              onClick={() => setConnectMethod('manual')}
                              disabled={isConnecting || isRegisteringSender}
                              className="rounded-xl px-4 py-2 text-sm font-semibold text-gray-500 transition hover:bg-white hover:text-gray-900 disabled:opacity-50"
                            >
                              Use manual connection
                            </button>
                          </div>
                        </div>
                      ) : (
                        <motion.form
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                          onSubmit={handleManualSubmit}
                          className="space-y-5"
                        >
                          <FormSection
                            title="Manual connection"
                            description="Use a long-lived token assigned to the WABA and phone number."
                          >
                            <div className="space-y-4">
                              <FormField
                                label="Long-lived access token"
                                helper="Must include whatsapp_business_messaging and whatsapp_business_management."
                              >
                                <input
                                  ref={manualTokenInputRef}
                                  type="text"
                                  required
                                  value={manualData.token}
                                  onChange={(event) =>
                                    setManualData((current) => ({ ...current, token: event.target.value }))
                                  }
                                  className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-[#1381FF] focus:ring-2 focus:ring-[#1381FF]/15"
                                />
                              </FormField>

                              <div className="grid gap-4 sm:grid-cols-2">
                                <FormField label="WABA ID">
                                  <input
                                    type="text"
                                    required
                                    value={manualData.wabaId}
                                    onChange={(event) =>
                                      setManualData((current) => ({ ...current, wabaId: event.target.value }))
                                    }
                                    className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-[#1381FF] focus:ring-2 focus:ring-[#1381FF]/15"
                                  />
                                </FormField>

                                <FormField label="Phone Number ID">
                                  <input
                                    type="text"
                                    required
                                    value={manualData.phoneId}
                                    onChange={(event) =>
                                      setManualData((current) => ({ ...current, phoneId: event.target.value }))
                                    }
                                    className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-[#1381FF] focus:ring-2 focus:ring-[#1381FF]/15"
                                  />
                                </FormField>
                              </div>
                            </div>

                            <div className="mt-4 grid gap-2 text-xs text-gray-500 sm:grid-cols-3">
                              {[
                                ['Token', manualData.token.trim()],
                                ['WABA ID', manualData.wabaId.trim()],
                                ['Phone ID', manualData.phoneId.trim()],
                              ].map(([label, value]) => (
                                <div key={label} className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2">
                                  <CheckCircle2
                                    className={`h-3.5 w-3.5 ${value ? 'text-emerald-500' : 'text-gray-300'}`}
                                  />
                                  {label}
                                </div>
                              ))}
                            </div>
                          </FormSection>

                          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <button
                              type="button"
                              onClick={() => setConnectMethod(null)}
                              className="h-12 rounded-xl px-4 text-sm font-semibold text-gray-500 transition hover:bg-white hover:text-gray-900"
                            >
                              Back to Facebook
                            </button>
                            <StepCTA
                              type="submit"
                              disabled={!manualConnectionReady || isConnecting || isRegisteringSender}
                              loading={isConnecting || isRegisteringSender}
                              icon={<CheckCircle2 className="h-4 w-4" />}
                            >
                              {isRegisteringSender
                                ? 'Activating WhatsApp...'
                                : isConnecting
                                  ? 'Verifying...'
                                  : 'Verify and connect'}
                            </StepCTA>
                          </div>
                        </motion.form>
                      )}

                      {onboardingChannel && error ? (
                        <StatusMessage tone="warning">
                          <p>The channel details were saved. You can retry automatic activation without entering a PIN.</p>
                          <button
                            type="button"
                            onClick={() =>
                              void activateSenderWithGeneratedPin(
                                'Automatic WhatsApp activation failed',
                              )
                            }
                            disabled={isRegisteringSender}
                            className="mt-3 inline-flex h-10 items-center justify-center rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:opacity-60"
                          >
                            {isRegisteringSender ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Retry automatic activation
                          </button>
                        </StatusMessage>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => setStep(1)}
                        className="h-10 rounded-xl px-3 text-sm font-semibold text-gray-500 transition hover:bg-white hover:text-gray-900"
                      >
                        Back to requirements
                      </button>
                    </motion.div>
                  ) : null}

                  {step === 3 ? (
                    <motion.div
                      key="step3"
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -12 }}
                      transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                      className="space-y-5"
                    >
                      <div className="mx-auto max-w-xl text-center">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-[#25D366]">
                          <Image className="h-6 w-6" />
                        </div>
                        <h3 className="mt-4 text-2xl font-semibold tracking-tight text-gray-950">
                          Review your public WhatsApp profile
                        </h3>
                        <p className="mx-auto mt-2 max-w-md text-sm leading-5 text-gray-500">
                          This is optional. Add only what you want customers to see.
                        </p>
                      </div>

                      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
                      {success ? <StatusMessage tone="success">{success}</StatusMessage> : null}

                      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
                        <FormSection
                          title="Business profile"
                          description={`Profile completion: ${businessProfileCompletion}%`}
                        >
                          <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-gray-100">
                            <motion.div
                              animate={{ width: `${businessProfileCompletion}%` }}
                              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                              className="h-full rounded-full bg-[#25D366]"
                            />
                          </div>

                          <div className="flex items-center gap-4 border-b border-gray-100 pb-4">
                            <BusinessProfileImage
                              src={businessProfilePhotoUrl}
                              name={businessProfilePreviewName}
                              className="h-16 w-16"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-gray-950">Profile picture</p>
                              <p className="mt-1 text-xs leading-4 text-gray-500">PNG or JPEG for this WhatsApp number.</p>
                              <button
                                type="button"
                                onClick={() => businessPhotoInputRef.current?.click()}
                                disabled={isUploadingBusinessPhoto || isSavingBusinessProfile}
                                className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
                              >
                                {isUploadingBusinessPhoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Image className="h-4 w-4" />}
                                {isUploadingBusinessPhoto ? 'Uploading...' : 'Upload photo'}
                              </button>
                              <input
                                ref={businessPhotoInputRef}
                                type="file"
                                accept="image/png,image/jpeg"
                                onChange={handleBusinessProfilePhotoUpload}
                                className="hidden"
                              />
                            </div>
                          </div>

                          <div className="mt-4 space-y-4">
                            <FormField label="Description" helper="Short description customers see in WhatsApp.">
                              <textarea
                                value={businessProfileForm.description}
                                onChange={(event) => handleBusinessProfileFieldChange('description', event.target.value)}
                                rows={3}
                                placeholder="Tell customers what your business does."
                                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-[#25D366] focus:ring-2 focus:ring-[#25D366]/15"
                              />
                            </FormField>

                            <FormField label="About">
                              <input
                                type="text"
                                value={businessProfileForm.about}
                                onChange={(event) => handleBusinessProfileFieldChange('about', event.target.value)}
                                placeholder="Short status line"
                                className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-[#25D366] focus:ring-2 focus:ring-[#25D366]/15"
                              />
                            </FormField>

                            <div className="grid gap-4 sm:grid-cols-2">
                              <FormField label="Email">
                                <input
                                  type="email"
                                  value={businessProfileForm.email}
                                  onChange={(event) => handleBusinessProfileFieldChange('email', event.target.value)}
                                  placeholder="hello@company.com"
                                  className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-[#25D366] focus:ring-2 focus:ring-[#25D366]/15"
                                />
                              </FormField>

                              <FormField label="Website">
                                <input
                                  type="text"
                                  value={businessProfileForm.website}
                                  onChange={(event) => handleBusinessProfileFieldChange('website', event.target.value)}
                                  placeholder="https://company.com"
                                  className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-[#25D366] focus:ring-2 focus:ring-[#25D366]/15"
                                />
                              </FormField>
                            </div>

                            <FormField label="Address">
                              <textarea
                                value={businessProfileForm.address}
                                onChange={(event) => handleBusinessProfileFieldChange('address', event.target.value)}
                                rows={2}
                                placeholder="Business address customers should see"
                                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-[#25D366] focus:ring-2 focus:ring-[#25D366]/15"
                              />
                            </FormField>
                          </div>
                        </FormSection>

                        <FormSection title="Live preview">
                          <div className="text-center">
                            <BusinessProfileImage
                              src={businessProfilePhotoUrl}
                              name={businessProfilePreviewName}
                              className="mx-auto h-16 w-16"
                            />
                            <h4 className="mt-4 text-base font-semibold text-gray-950">{businessProfilePreviewName}</h4>
                            <p className="mt-2 text-sm leading-5 text-gray-500">{businessProfilePreviewSummary}</p>
                          </div>

                          <div className="mt-4 space-y-3 border-t border-gray-100 pt-4 text-left">
                            <div className="flex items-start gap-2 text-xs leading-5 text-gray-600">
                              <ChannelBrandIcon channel="whatsapp" className="mt-0.5 h-4 w-4 shrink-0" alt="" />
                              <span>{onboardingChannel?.displayPhoneNumber || onboardingChannel?.phoneNumberId || 'Connected WhatsApp number'}</span>
                            </div>
                            {businessProfilePreviewWebsite ? (
                              <div className="flex items-start gap-2 text-xs leading-5 text-gray-600">
                                <Globe className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                                <span className="break-all">{businessProfilePreviewWebsite}</span>
                              </div>
                            ) : null}
                            {businessProfilePreviewEmail ? (
                              <div className="flex items-start gap-2 text-xs leading-5 text-gray-600">
                                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                                <span className="break-all">{businessProfilePreviewEmail}</span>
                              </div>
                            ) : null}
                            {businessProfilePreviewAddress ? (
                              <div className="flex items-start gap-2 text-xs leading-5 text-gray-600">
                                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                                <span>{businessProfilePreviewAddress}</span>
                              </div>
                            ) : null}
                          </div>
                        </FormSection>
                      </div>

                      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <button
                          type="button"
                          onClick={() => setStep(4)}
                          disabled={isSavingBusinessProfile || isUploadingBusinessPhoto}
                          className="h-12 rounded-xl px-4 text-sm font-semibold text-gray-500 transition hover:bg-white hover:text-gray-900 disabled:opacity-60"
                        >
                          Skip for now
                        </button>
                        <StepCTA
                          type="button"
                          variant="success"
                          onClick={() => void handleSaveBusinessProfile()}
                          disabled={isSavingBusinessProfile || isUploadingBusinessPhoto}
                          loading={isSavingBusinessProfile}
                          icon={<CheckCircle2 className="h-4 w-4" />}
                        >
                          {isSavingBusinessProfile ? 'Saving profile...' : 'Save and continue'}
                        </StepCTA>
                      </div>
                    </motion.div>
                  ) : null}

                  {step === 4 ? (
                    <motion.div
                      key="step4"
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -12 }}
                      transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                      className="mx-auto max-w-xl py-8 text-center"
                    >
                      <motion.div
                        initial={{ opacity: 0, scale: 0.92 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                        className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-500"
                      >
                        <CheckCircle2 className="h-10 w-10" />
                      </motion.div>
                      <h3 className="mt-6 text-3xl font-semibold tracking-tight text-gray-950">WhatsApp is ready</h3>
                      <p className="mx-auto mt-3 max-w-md text-sm leading-5 text-gray-500">
                        Your WhatsApp Business number is connected, activation ran, and the workspace is ready for templates, inbox, and dashboard updates.
                      </p>
                      <StepCTA
                        type="button"
                        onClick={() => void finishOnboarding()}
                        icon={<ArrowRight className="h-4 w-4" />}
                        className="mt-8"
                      >
                        Continue to Plan Selection
                      </StepCTA>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
