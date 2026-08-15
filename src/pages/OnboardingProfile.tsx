import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight,
  CheckCircle2,
  ImagePlus,
  Loader2,
  MessageCircle,
  Phone,
  ShieldCheck,
  User,
  UsersRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/min';
import { appApi } from '../lib/api';
import { useAppData } from '../context/AppDataContext';
import FeedbackPopupStack from '../components/FeedbackPopupStack';
import OnboardingTopBar from '../components/OnboardingTopBar';
import ProfilePhotoEditor from '../components/ProfilePhotoEditor';
import UserAvatar from '../components/UserAvatar';
import { DropdownSelect } from '../components/ui/DropdownSelect';
import {
  WALLET_CURRENCY_OPTIONS,
  getCurrencyLabel,
  getPreferredCurrencyFromCallingCode,
  normalizePreferredCurrency,
} from '../lib/wallet';

const COUNTRIES: Array<{ code: string; isoCode: CountryCode; label: string; name: string; placeholder: string }> = [
  { code: '+1', isoCode: 'US', label: 'US +1', name: 'United States', placeholder: '2133734253' },
  { code: '+44', isoCode: 'GB', label: 'UK +44', name: 'United Kingdom', placeholder: '2079460018' },
  { code: '+91', isoCode: 'IN', label: 'IN +91', name: 'India', placeholder: '9876543210' },
  { code: '+61', isoCode: 'AU', label: 'AU +61', name: 'Australia', placeholder: '412345678' },
  { code: '+81', isoCode: 'JP', label: 'JP +81', name: 'Japan', placeholder: '9012345678' },
  { code: '+49', isoCode: 'DE', label: 'DE +49', name: 'Germany', placeholder: '15123456789' },
  { code: '+33', isoCode: 'FR', label: 'FR +33', name: 'France', placeholder: '612345678' },
];

const DEFAULT_COUNTRY_CODE = '+91';
const DEFAULT_PREFERRED_CURRENCY = 'INR';

const PROFILE_USE_CASES: Array<{ label: string; description: string; icon: LucideIcon }> = [
  {
    label: 'Inbox assignment',
    description: 'Teammates can see who owns a conversation.',
    icon: UsersRound,
  },
  {
    label: 'Call identity',
    description: 'Calls and callbacks stay tied to your profile.',
    icon: Phone,
  },
  {
    label: 'Team activity',
    description: 'Templates, notes, and actions show clear ownership.',
    icon: MessageCircle,
  },
];

function ProfileField({
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
    <div>
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
    </div>
  );
}

export default function OnboardingProfile() {
  const navigate = useNavigate();
  const { bootstrap, refresh, setBootstrap } = useAppData();
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const profilePictureInputRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);
  const [preferredCurrency, setPreferredCurrency] = useState(DEFAULT_PREFERRED_CURRENCY);
  const [hasEditedPreferredCurrency, setHasEditedPreferredCurrency] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingProfilePicture, setIsUploadingProfilePicture] = useState(false);
  const [profilePicturePreviewUrl, setProfilePicturePreviewUrl] = useState<string | null>(null);
  const [profilePictureEditorSourceUrl, setProfilePictureEditorSourceUrl] = useState<string | null>(null);
  const [profilePictureEditorFileName, setProfilePictureEditorFileName] = useState('profile-photo.jpg');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(bootstrap?.profile?.fullName || '');
    setPhone(bootstrap?.profile?.phone || '');
    const nextCountryCode = bootstrap?.profile?.countryCode || DEFAULT_COUNTRY_CODE;
    const savedCurrency = normalizePreferredCurrency(bootstrap?.profile?.preferredCurrency);

    setCountryCode(nextCountryCode);
    setPreferredCurrency(savedCurrency || getPreferredCurrencyFromCallingCode(nextCountryCode) || DEFAULT_PREFERRED_CURRENCY);
    setHasEditedPreferredCurrency(false);
  }, [
    bootstrap?.profile?.countryCode,
    bootstrap?.profile?.fullName,
    bootstrap?.profile?.phone,
    bootstrap?.profile?.preferredCurrency,
  ]);

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  useEffect(() => {
    return () => {
      if (profilePicturePreviewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(profilePicturePreviewUrl);
      }
    };
  }, [profilePicturePreviewUrl]);

  useEffect(() => {
    return () => {
      if (profilePictureEditorSourceUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(profilePictureEditorSourceUrl);
      }
    };
  }, [profilePictureEditorSourceUrl]);

  useEffect(() => {
    if (hasEditedPreferredCurrency || normalizePreferredCurrency(bootstrap?.profile?.preferredCurrency)) {
      return;
    }

    setPreferredCurrency(getPreferredCurrencyFromCallingCode(countryCode));
  }, [bootstrap?.profile?.preferredCurrency, countryCode, hasEditedPreferredCurrency]);

  const selectedCountry =
    COUNTRIES.find((country) => country.code === countryCode) ||
    COUNTRIES.find((country) => country.code === DEFAULT_COUNTRY_CODE) ||
    COUNTRIES[0];
  const phoneDigits = phone.replace(/\D/g, '');
  const parsedPhoneNumber = phoneDigits
    ? parsePhoneNumberFromString(phoneDigits, selectedCountry.isoCode)
    : null;
  const hasName = name.trim() !== '';
  const isPhoneValid = Boolean(
    parsedPhoneNumber?.isValid() &&
      parsedPhoneNumber.country === selectedCountry.isoCode &&
      (selectedCountry.isoCode !== 'IN' || phoneDigits.length === 10),
  );
  const showPhoneError = phoneDigits !== '' && !isPhoneValid;
  const phoneValidationMessage =
    selectedCountry.isoCode === 'IN' && phoneDigits !== '' && phoneDigits.length !== 10
      ? 'Indian (+91) contact numbers must be 10 digits.'
      : `Enter a valid contact number for ${selectedCountry.name} (${selectedCountry.code}).`;
  const resolvedProfilePictureUrl =
    profilePicturePreviewUrl || bootstrap?.profile?.profilePictureUrl || null;
  const isFormValid = hasName && isPhoneValid;
  const progressPercent = isFormValid ? 100 : hasName ? 68 : 32;
  const previewName = name.trim() || 'Your profile';
  const previewPhone = phoneDigits ? `${countryCode} ${phoneDigits}` : 'Add your contact number';
  const previewCurrency = getCurrencyLabel(preferredCurrency);

  const handleProfilePictureSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setError('Profile picture must be a PNG or JPEG image.');
      input.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Profile picture must be 5 MB or smaller.');
      input.value = '';
      return;
    }

    setError(null);
    setProfilePictureEditorSourceUrl(URL.createObjectURL(file));
    setProfilePictureEditorFileName(file.name || 'profile-photo.jpg');
    input.value = '';
  };

  const handleProfilePictureUpload = async (file: File) => {
    setIsUploadingProfilePicture(true);
    setProfilePicturePreviewUrl(URL.createObjectURL(file));

    try {
      const response = await appApi.uploadProfilePhoto(file);

      setBootstrap((current) =>
        current
          ? {
              ...current,
              profile: response.profile,
            }
          : current,
      );
      setProfilePicturePreviewUrl(response.profile?.profilePictureUrl || null);
      setProfilePictureEditorSourceUrl(null);
    } catch (uploadError) {
      setProfilePicturePreviewUrl(null);
      setError(uploadError instanceof Error ? uploadError.message : 'Failed to upload profile picture.');
    } finally {
      setIsUploadingProfilePicture(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!isFormValid || !parsedPhoneNumber) {
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      await appApi.saveProfile({
        fullName: name.trim(),
        phone: parsedPhoneNumber.nationalNumber,
        countryCode,
        preferredCurrency,
      });
      await refresh();
      navigate('/onboarding');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to save your profile.');
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
        className="relative z-10 w-full max-w-[560px]"
      >
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between text-xs font-medium text-gray-500">
            <span>Profile setup</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-200">
            <motion.div
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className="h-full rounded-full bg-[#1381FF]"
            />
          </div>
        </div>

        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1381FF]">Step 1 of 4</p>
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, delay: 0.05 }}
            className="mx-auto mt-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-[#1381FF]"
          >
            <User className="h-7 w-7" />
          </motion.div>
          <h1 className="mt-6 text-[32px] font-semibold leading-10 tracking-tight text-gray-950">
            Set up your profile.
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-5 text-gray-500">
            We&apos;ll use this for assignments, calls, templates, workspace activity, and wallet defaults.
          </p>
        </div>

        <FeedbackPopupStack
          items={error ? [{ id: 'onboarding-profile-error', tone: 'error' as const, message: error, onDismiss: () => setError(null) }] : []}
        />

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, delay: 0.04 }}
            className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center gap-4">
              <UserAvatar
                name={previewName}
                imageUrl={resolvedProfilePictureUrl}
                className="h-16 w-16 shrink-0 shadow-sm"
                initialsClassName="text-lg font-semibold"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-gray-950">{previewName}</p>
                  {resolvedProfilePictureUrl ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  ) : null}
                </div>
                <p className="mt-1 truncate text-xs leading-4 text-gray-500">{previewPhone}</p>
                <p className="mt-1 truncate text-xs leading-4 text-gray-500">Default wallet currency: {previewCurrency}</p>
                <button
                  type="button"
                  onClick={() => profilePictureInputRef.current?.click()}
                  disabled={isUploadingProfilePicture}
                  className="mt-3 inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isUploadingProfilePicture ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ImagePlus className="h-4 w-4" />
                  )}
                  {resolvedProfilePictureUrl ? 'Change photo' : 'Add photo'}
                </button>
              </div>
            </div>
            <input
              ref={profilePictureInputRef}
              type="file"
              accept="image/png,image/jpeg"
              onChange={handleProfilePictureSelection}
              className="hidden"
            />
            <p className="mt-4 border-t border-gray-100 pt-4 text-xs leading-4 text-gray-500">
              Optional. Add a PNG or JPEG up to 5 MB so teammates can recognize you faster.
            </p>
          </motion.section>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, delay: 0.08 }}
          >
            <ProfileField
              label="Full name"
              isValid={hasName}
              helper="This is shown in the inbox, activity feed, and workspace user lists."
            >
              <div className="group relative">
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 transition group-focus-within:text-[#1381FF]" />
                <input
                  ref={nameInputRef}
                  type="text"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setError(null);
                  }}
                  placeholder="John Doe"
                  className="h-11 w-full rounded-lg border border-gray-200 bg-white pl-10 pr-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-[#1381FF] focus:ring-2 focus:ring-[#1381FF]/15"
                  required
                />
              </div>
            </ProfileField>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, delay: 0.12 }}
          >
            <ProfileField
              label="Contact number"
              isValid={isPhoneValid}
              helper={
                showPhoneError ? (
                  <span id="contact-number-error" className="text-red-600">
                    {phoneValidationMessage}
                  </span>
                ) : (
                  'Use the number your team should reach you on for calls and account activity.'
                )
              }
            >
              <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
                <DropdownSelect
                  value={countryCode}
                  onChange={(nextCountryCode) => {
                    setCountryCode(nextCountryCode);
                    setError(null);
                  }}
                  options={COUNTRIES.map((country) => ({
                    value: country.code,
                    label: country.label,
                  }))}
                  ariaLabel="Select country calling code"
                  buttonClassName="h-11 rounded-lg border-gray-200 px-3 py-0 focus:border-[#1381FF] focus:ring-[#1381FF]/15"
                />
                <div className="group relative">
                  <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 transition group-focus-within:text-[#1381FF]" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(event) => {
                      setPhone(event.target.value.replace(/\D/g, ''));
                      setError(null);
                    }}
                    placeholder={selectedCountry.placeholder}
                    inputMode="numeric"
                    aria-invalid={showPhoneError}
                    aria-describedby={showPhoneError ? 'contact-number-error' : undefined}
                    className={`h-11 w-full rounded-lg border bg-white pl-10 pr-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:ring-2 ${
                      showPhoneError
                        ? 'border-red-300 focus:border-red-500 focus:ring-red-500/15'
                        : 'border-gray-200 focus:border-[#1381FF] focus:ring-[#1381FF]/15'
                    }`}
                    required
                  />
                </div>
              </div>
            </ProfileField>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, delay: 0.16 }}
          >
            <ProfileField
              label="Preferred billing currency"
              helper="This becomes the default currency for your platform wallet, balance visibility, and future top-ups."
            >
              <DropdownSelect
                value={preferredCurrency}
                onChange={(nextCurrency) => {
                  setPreferredCurrency(nextCurrency);
                  setHasEditedPreferredCurrency(true);
                  setError(null);
                }}
                options={WALLET_CURRENCY_OPTIONS.map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
                icon={<Wallet className="h-4 w-4" />}
                ariaLabel="Select preferred billing currency"
                buttonClassName="h-11 rounded-lg border-gray-200 px-3 py-0 focus:border-[#1381FF] focus:ring-[#1381FF]/15"
              />
            </ProfileField>
          </motion.div>

          <AnimatePresence>
            {isFormValid ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-[#1381FF]">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-950">We&apos;ll use this profile for:</p>
                    <div className="mt-3 grid gap-2">
                      {PROFILE_USE_CASES.map((item) => {
                        const Icon = item.icon;

                        return (
                        <div key={item.label} className="flex items-start gap-3 rounded-xl bg-gray-50 px-3 py-2">
                          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#1381FF]" />
                          <div>
                            <p className="text-xs font-semibold text-gray-800">{item.label}</p>
                            <p className="mt-0.5 text-xs leading-4 text-gray-500">{item.description}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 rounded-xl bg-sky-50 px-3 py-2 text-xs leading-4 text-sky-700">
                      Platform wallet default: <span className="font-semibold">{previewCurrency}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <motion.button
            type="submit"
            whileHover={isFormValid && !isSaving && !isUploadingProfilePicture ? { y: -1 } : undefined}
            whileTap={isFormValid && !isSaving && !isUploadingProfilePicture ? { scale: 0.98 } : undefined}
            disabled={!isFormValid || isSaving || isUploadingProfilePicture}
            className={`inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold transition ${
              isFormValid && !isSaving && !isUploadingProfilePicture
                ? 'bg-[#1381FF] text-white shadow-lg shadow-sky-500/20 hover:bg-[#0F6FEA]'
                : 'cursor-not-allowed bg-gray-200 text-gray-500'
            }`}
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Continue to Business Details
            {!isSaving ? <ArrowRight className="h-4 w-4" /> : null}
          </motion.button>

          <p className="text-center text-xs leading-4 text-gray-400">
            This keeps your workspace activity clear for your team.
          </p>
        </form>
        <ProfilePhotoEditor
          sourceUrl={profilePictureEditorSourceUrl}
          fileName={profilePictureEditorFileName}
          isSaving={isUploadingProfilePicture}
          onCancel={() => setProfilePictureEditorSourceUrl(null)}
          onError={setError}
          onSave={handleProfilePictureUpload}
        />
      </motion.main>
    </div>
  );
}
