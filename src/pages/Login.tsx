import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClipboardEvent, FormEvent, KeyboardEvent, MutableRefObject, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import {
  clearPasswordRecoveryIntent,
  getCachedSession,
  hasPasswordRecoveryIntent,
  rememberPasswordRecoveryIntent,
  supabase,
} from '../lib/supabase';
import { appApi } from '../lib/api';
import TurnstileWidget from '../components/TurnstileWidget';
import { clientConfig, hasTurnstileSiteKey } from '../lib/config';
import {
  AuthAlert,
  AuthForm,
  AuthLayout,
  Divider,
  InputField,
  PasswordField,
  PrimaryAuthButton,
  SocialLoginButton,
} from '../components/auth/AuthComponents';

type OAuthProvider = 'google' | 'facebook';
type PendingMfaChallenge = {
  factorId: string;
  challengeId: string;
  factorName: string;
  email: string;
};
type CaptchaTokenWaiter = {
  resolve: (token: string) => void;
  reject: (error: Error) => void;
  timeoutId: number;
};

const SECURITY_VERIFICATION_TIMEOUT_MS = 10000;

function getRememberedEmail() {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.localStorage.getItem('connektly:last-login-email') || '';
}

function rememberEmail(value: string) {
  if (typeof window === 'undefined') {
    return;
  }

  const trimmedEmail = value.trim();
  if (trimmedEmail) {
    window.localStorage.setItem('connektly:last-login-email', trimmedEmail);
  }
}

function getPasswordSetupHashType() {
  if (typeof window === 'undefined') {
    return null;
  }

  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const hashParams = new URLSearchParams(hash);
  const searchParams = new URLSearchParams(window.location.search);

  const type =
    hashParams.get('type') ||
    searchParams.get('type') ||
    hashParams.get('password_setup') ||
    searchParams.get('password_setup');

  if (type === 'recovery' || hasPasswordRecoveryIntent()) {
    return 'recovery';
  }

  return type === 'invite' ? 'invite' : null;
}

function AuthModal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm sm:items-center">
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
        className="max-h-[calc(100vh-3rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold leading-8 text-[#0F172A]">{title}</h2>
            <p className="mt-1 text-sm leading-5 text-[#64748B]">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#E2E8F0] text-[#64748B] transition hover:bg-[#F8FAFC] hover:text-[#0F172A]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-6">{children}</div>
      </motion.div>
    </div>
  );
}

function getOtpDigits(value: string) {
  return value.replace(/\D/g, '').slice(0, 6).split('');
}

export default function Login() {
  const [email, setEmail] = useState(getRememberedEmail);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [oauthLoadingProvider, setOauthLoadingProvider] = useState<OAuthProvider | null>(null);
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [forgotPasswordCaptchaToken, setForgotPasswordCaptchaToken] = useState<string | null>(null);
  const [forgotPasswordCaptchaResetKey, setForgotPasswordCaptchaResetKey] = useState(0);
  const [forgotPasswordMessage, setForgotPasswordMessage] = useState('');
  const [forgotPasswordError, setForgotPasswordError] = useState('');
  const [isSendingResetEmail, setIsSendingResetEmail] = useState(false);
  const [isRecoveryFlow, setIsRecoveryFlow] = useState(false);
  const [isInvitePasswordSetup, setIsInvitePasswordSetup] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [recoveryError, setRecoveryError] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [pendingMfaChallenge, setPendingMfaChallenge] = useState<PendingMfaChallenge | null>(null);
  const [mfaCode, setMfaCode] = useState<string[]>(Array(6).fill(''));
  const [mfaError, setMfaError] = useState('');
  const [isPreparingMfa, setIsPreparingMfa] = useState(false);
  const [isVerifyingMfa, setIsVerifyingMfa] = useState(false);
  const mfaInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const captchaTokenRef = useRef<string | null>(null);
  const captchaTokenWaitersRef = useRef<CaptchaTokenWaiter[]>([]);
  const forgotPasswordCaptchaTokenRef = useRef<string | null>(null);
  const forgotPasswordCaptchaTokenWaitersRef = useRef<CaptchaTokenWaiter[]>([]);
  const navigate = useNavigate();

  const resolveCaptchaTokenWaiters = useCallback(
    (waitersRef: MutableRefObject<CaptchaTokenWaiter[]>, nextToken: string | null) => {
      if (!nextToken) {
        return;
      }

      const waiters = waitersRef.current;
      waitersRef.current = [];
      waiters.forEach((waiter) => {
        window.clearTimeout(waiter.timeoutId);
        waiter.resolve(nextToken);
      });
    },
    [],
  );

  const waitForCaptchaToken = useCallback(
    (
      tokenRef: MutableRefObject<string | null>,
      waitersRef: MutableRefObject<CaptchaTokenWaiter[]>,
      resetCaptcha: () => void,
    ) => {
      const currentToken = tokenRef.current;
      if (currentToken) {
        return Promise.resolve(currentToken);
      }

      return new Promise<string>((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
          waitersRef.current = waitersRef.current.filter((waiter) => waiter.timeoutId !== timeoutId);
          resetCaptcha();
          reject(new Error('Security verification is taking longer than expected. Please try again.'));
        }, SECURITY_VERIFICATION_TIMEOUT_MS);

        waitersRef.current.push({ resolve, reject, timeoutId });
      });
    },
    [],
  );

  useEffect(() => {
    captchaTokenRef.current = captchaToken;
    resolveCaptchaTokenWaiters(captchaTokenWaitersRef, captchaToken);
  }, [captchaToken, resolveCaptchaTokenWaiters]);

  useEffect(() => {
    forgotPasswordCaptchaTokenRef.current = forgotPasswordCaptchaToken;
    resolveCaptchaTokenWaiters(forgotPasswordCaptchaTokenWaitersRef, forgotPasswordCaptchaToken);
  }, [forgotPasswordCaptchaToken, resolveCaptchaTokenWaiters]);

  useEffect(() => {
    return () => {
      [...captchaTokenWaitersRef.current, ...forgotPasswordCaptchaTokenWaitersRef.current].forEach((waiter) => {
        window.clearTimeout(waiter.timeoutId);
        waiter.reject(new Error('Security verification was cancelled.'));
      });
      captchaTokenWaitersRef.current = [];
      forgotPasswordCaptchaTokenWaitersRef.current = [];
    };
  }, []);

  const navigateAfterAuthenticatedLogin = async () => {
    try {
      const bootstrap = await appApi.getBootstrap();
      navigate(bootstrap.profile?.onboardingCompleted ? '/dashboard/home' : '/onboarding/plans');
    } catch {
      navigate('/dashboard/home');
    }
  };

  const clearMfaPrompt = () => {
    setPendingMfaChallenge(null);
    setMfaCode(Array(6).fill(''));
    setMfaError('');
    setIsPreparingMfa(false);
    setIsVerifyingMfa(false);
  };

  const prepareMfaChallenge = async (sessionEmail?: string | null) => {
    setIsPreparingMfa(true);
    setMfaError('');

    try {
      const { data: assurance, error: assuranceError } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

      if (assuranceError) {
        throw assuranceError;
      }

      if (assurance?.currentLevel === 'aal2' || assurance?.nextLevel !== 'aal2') {
        return false;
      }

      const { data: factorsResult, error: factorsError } = await supabase.auth.mfa.listFactors();

      if (factorsError) {
        throw factorsError;
      }

      const totpFactors = (factorsResult?.totp as Array<Record<string, unknown>> | undefined) || [];
      const allFactors = (factorsResult?.all as Array<Record<string, unknown>> | undefined) || [];
      const verifiedTotpFactor =
        totpFactors.find((factor) => factor.status === 'verified' && typeof factor.id === 'string') ||
        allFactors.find(
          (factor) => factor.factor_type === 'totp' && factor.status === 'verified' && typeof factor.id === 'string',
        );

      if (!verifiedTotpFactor?.id) {
        throw new Error('Authenticator verification is required, but no verified authenticator app was found.');
      }

      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: verifiedTotpFactor.id as string,
      });

      if (challengeError) {
        throw challengeError;
      }

      setPendingMfaChallenge({
        factorId: verifiedTotpFactor.id as string,
        challengeId: challenge.id,
        factorName:
          typeof verifiedTotpFactor.friendly_name === 'string' && verifiedTotpFactor.friendly_name.trim()
            ? verifiedTotpFactor.friendly_name.trim()
            : 'Authenticator app',
        email: sessionEmail || email.trim(),
      });
      setMfaCode(Array(6).fill(''));
      window.setTimeout(() => mfaInputRefs.current[0]?.focus(), 50);
      return true;
    } finally {
      setIsPreparingMfa(false);
    }
  };

  const continueAfterPasswordAccepted = async (sessionEmail?: string | null) => {
    const needsMfa = await prepareMfaChallenge(sessionEmail);
    if (!needsMfa) {
      await navigateAfterAuthenticatedLogin();
    }
  };

  useEffect(() => {
    const passwordSetupType = getPasswordSetupHashType();
    const shouldStayOnLogin = Boolean(passwordSetupType);

    if (passwordSetupType === 'recovery') {
      rememberPasswordRecoveryIntent();
    }

    setIsRecoveryFlow(shouldStayOnLogin);
    setIsInvitePasswordSetup(passwordSetupType === 'invite');

    getCachedSession().then((session) => {
      if (session && !shouldStayOnLogin && !hasPasswordRecoveryIntent()) {
        void continueAfterPasswordAccepted(session.user.email).catch(async (error) => {
          await supabase.auth.signOut().catch(() => null);
          setError(error instanceof Error ? error.message : 'Failed to verify account security.');
        });
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      const nextPasswordSetupType = getPasswordSetupHashType();
      if (event === 'PASSWORD_RECOVERY') {
        rememberPasswordRecoveryIntent();
      }

      if (event === 'PASSWORD_RECOVERY' || nextPasswordSetupType) {
        setIsRecoveryFlow(true);
        setIsInvitePasswordSetup(nextPasswordSetupType === 'invite');
        setRecoveryError('');
        setRecoveryMessage('');
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      setError('Login is not configured yet. Add the required authentication values in Settings > Secrets.');
      return;
    }

    if (supabaseUrl === 'YOUR_SUPABASE_PROJECT_URL' || supabaseKey === 'YOUR_SUPABASE_ANON_KEY') {
      setError('Replace the placeholder authentication values in Settings > Secrets before logging in.');
      return;
    }

    setIsLoading(true);

    try {
      const verifiedCaptchaToken = hasTurnstileSiteKey
        ? await waitForCaptchaToken(captchaTokenRef, captchaTokenWaitersRef, () =>
            setCaptchaResetKey((current) => current + 1),
          )
        : undefined;

      rememberEmail(email);
      const loginPromise = supabase.auth.signInWithPassword({
        email,
        password,
        options: hasTurnstileSiteKey ? { captchaToken: verifiedCaptchaToken } : undefined,
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out. Please check your internet connection and try again.')), 15000),
      );

      const { data, error } = await Promise.race([loginPromise, timeoutPromise]) as any;

      if (error) {
        throw error;
      }

      if (data?.user) {
        await continueAfterPasswordAccepted(data.user.email);
      } else {
        throw new Error('An unexpected error occurred during login.');
      }
    } catch (err: any) {
      await supabase.auth.signOut().catch(() => null);
      setError(err?.message || 'Failed to login. Please check your credentials.');
      setCaptchaResetKey((current) => current + 1);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMfaDigitChange = (index: number, value: string) => {
    const digits = getOtpDigits(value);

    if (!digits.length) {
      setMfaCode((current) => current.map((digit, digitIndex) => (digitIndex === index ? '' : digit)));
      return;
    }

    setMfaError('');
    setMfaCode((current) => {
      const next = [...current];
      digits.forEach((digit, digitOffset) => {
        const targetIndex = index + digitOffset;
        if (targetIndex < next.length) {
          next[targetIndex] = digit;
        }
      });
      return next;
    });

    const nextFocusIndex = Math.min(index + digits.length, 5);
    window.setTimeout(() => mfaInputRefs.current[nextFocusIndex]?.focus(), 0);
  };

  const handleMfaKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !mfaCode[index] && index > 0) {
      mfaInputRefs.current[index - 1]?.focus();
      return;
    }

    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      mfaInputRefs.current[index - 1]?.focus();
      return;
    }

    if (event.key === 'ArrowRight' && index < 5) {
      event.preventDefault();
      mfaInputRefs.current[index + 1]?.focus();
    }
  };

  const handleMfaPaste = (index: number, event: ClipboardEvent<HTMLInputElement>) => {
    const digits = getOtpDigits(event.clipboardData.getData('text'));

    if (!digits.length) {
      return;
    }

    event.preventDefault();
    handleMfaDigitChange(index, digits.join(''));
  };

  const handleVerifyMfa = async (event: FormEvent) => {
    event.preventDefault();

    if (!pendingMfaChallenge) {
      return;
    }

    const code = mfaCode.join('');

    if (!/^\d{6}$/.test(code)) {
      setMfaError('Enter the 6-digit code from your authenticator app.');
      mfaInputRefs.current[Math.max(0, mfaCode.findIndex((digit) => !digit))]?.focus();
      return;
    }

    try {
      setIsVerifyingMfa(true);
      setMfaError('');

      const { error } = await supabase.auth.mfa.verify({
        factorId: pendingMfaChallenge.factorId,
        challengeId: pendingMfaChallenge.challengeId,
        code,
      });

      if (error) {
        throw error;
      }

      clearMfaPrompt();
      await navigateAfterAuthenticatedLogin();
    } catch (err: any) {
      setMfaError(err?.message || 'Invalid authenticator code. Please try again.');
      setMfaCode(Array(6).fill(''));
      window.setTimeout(() => mfaInputRefs.current[0]?.focus(), 50);
    } finally {
      setIsVerifyingMfa(false);
    }
  };

  const handleCancelMfa = async () => {
    await supabase.auth.signOut();
    clearMfaPrompt();
    setError('Authenticator verification was cancelled.');
  };

  const handleOAuthLogin = async (provider: OAuthProvider) => {
    setError('');

    setOauthLoadingProvider(provider);

    try {
      const verifiedCaptchaToken = hasTurnstileSiteKey
        ? await waitForCaptchaToken(captchaTokenRef, captchaTokenWaitersRef, () =>
            setCaptchaResetKey((current) => current + 1),
          )
        : undefined;

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/login`,
          ...(provider === 'google'
            ? {
                queryParams: {
                  prompt: 'select_account',
                },
              }
            : {}),
          ...(provider === 'facebook' ? { scopes: 'email,public_profile' } : {}),
          ...(verifiedCaptchaToken ? { captchaToken: verifiedCaptchaToken } : {}),
        } as any,
      });

      if (error) {
        throw error;
      }
    } catch (err: any) {
      setError(
        err?.message ||
          `Failed to start ${provider === 'google' ? 'Google' : 'Facebook'} login. Please try again.`,
      );
      setOauthLoadingProvider(null);
      setCaptchaResetKey((current) => current + 1);
    }
  };

  const handleForgotPassword = async (event: FormEvent) => {
    event.preventDefault();
    setForgotPasswordError('');
    setForgotPasswordMessage('');

    setIsSendingResetEmail(true);

    try {
      const verifiedCaptchaToken = hasTurnstileSiteKey
        ? await waitForCaptchaToken(forgotPasswordCaptchaTokenRef, forgotPasswordCaptchaTokenWaitersRef, () =>
            setForgotPasswordCaptchaResetKey((current) => current + 1),
          )
        : undefined;

      await appApi.requestPasswordResetEmail({
        email: resetEmail.trim(),
        redirectTo: `${window.location.origin}/login?password_setup=recovery`,
        captchaToken: verifiedCaptchaToken,
      });

      setForgotPasswordMessage('Password reset email sent. Please check your inbox.');
      setForgotPasswordCaptchaToken(null);
      setForgotPasswordCaptchaResetKey((current) => current + 1);
    } catch (err: any) {
      setForgotPasswordError(err?.message || 'Failed to send password reset email.');
      setForgotPasswordCaptchaResetKey((current) => current + 1);
    } finally {
      setIsSendingResetEmail(false);
    }
  };

  const closeForgotPasswordModal = () => {
    setIsForgotPasswordOpen(false);
    setResetEmail(email);
    setForgotPasswordError('');
    setForgotPasswordMessage('');
    setForgotPasswordCaptchaToken(null);
    setForgotPasswordCaptchaResetKey((current) => current + 1);
  };

  const handleUpdatePassword = async (event: FormEvent) => {
    event.preventDefault();
    setRecoveryError('');
    setRecoveryMessage('');

    if (newPassword.length < 6) {
      setRecoveryError('Password must be at least 6 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setRecoveryError('Passwords do not match.');
      return;
    }

    setIsUpdatingPassword(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        throw error;
      }

      clearPasswordRecoveryIntent();
      await supabase.auth.signOut();
      window.history.replaceState({}, document.title, '/login');
      setIsRecoveryFlow(false);
      setIsInvitePasswordSetup(false);
      setNewPassword('');
      setConfirmPassword('');
      setRecoveryMessage(
        isInvitePasswordSetup
          ? 'Invite accepted. Please log in with your new password.'
          : 'Password updated successfully. Please log in with your new password.',
      );
    } catch (err: any) {
      setRecoveryError(err?.message || 'Failed to update password.');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const openForgotPasswordModal = () => {
    setResetEmail(email);
    setForgotPasswordError('');
    setForgotPasswordMessage('');
    setForgotPasswordCaptchaToken(null);
    setForgotPasswordCaptchaResetKey((current) => current + 1);
    setIsForgotPasswordOpen(true);
  };

  const canSubmitLogin = email.trim().length > 0 && password.length > 0;

  return (
    <AuthLayout
      mode="login"
      heroTitle={
        <>
          Do more with <span className="text-[#1381FF]">Ads</span> and{' '}
          <span className="text-[#1381FF]">Conversations</span>
        </>
      }
      heroDescription="Connektly keeps messages, campaigns, calls, leads, and notifications organized for fast-moving teams."
      switchText="Not a member yet?"
      switchHref="/signup"
      switchLabel="Sign up"
    >
      <AuthForm
        title="Welcome Back"
        description="Sign in to continue to Connektly."
      >
        <div className="space-y-4">
          {error ? <AuthAlert>{error}</AuthAlert> : null}
          {recoveryMessage ? <AuthAlert tone="success">{recoveryMessage}</AuthAlert> : null}

          <form className="space-y-4" onSubmit={handleLogin}>
            <InputField
              label="Email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              autoFocus
              required
            />

            <PasswordField
              label="Password"
              placeholder="Enter your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              showCapsLockWarning
              required
            />

            {hasTurnstileSiteKey ? (
              <TurnstileWidget
                siteKey={clientConfig.turnstile.siteKey}
                isLocalhost={clientConfig.turnstile.isLocalhost}
                token={captchaToken}
                onTokenChange={setCaptchaToken}
                resetKey={captchaResetKey}
              />
            ) : null}

            <PrimaryAuthButton
              loading={isLoading || isPreparingMfa}
              disabled={isLoading || isPreparingMfa || !canSubmitLogin}
              loadingLabel={isPreparingMfa ? 'Checking 2FA...' : 'Logging in...'}
            >
              Log in
            </PrimaryAuthButton>
          </form>

          <button
            type="button"
            onClick={openForgotPasswordModal}
            className="w-full text-center text-sm font-medium text-[#1381FF] transition hover:text-[#0F6FEA]"
          >
            Forgot password?
          </button>

          <Divider />

          <div className="grid grid-cols-2 gap-3">
            <SocialLoginButton
              provider="google"
              loading={oauthLoadingProvider === 'google'}
              disabled={oauthLoadingProvider !== null || isLoading || isPreparingMfa}
              onClick={() => void handleOAuthLogin('google')}
            >
              Google
            </SocialLoginButton>

            <SocialLoginButton
              provider="facebook"
              loading={oauthLoadingProvider === 'facebook'}
              disabled={oauthLoadingProvider !== null || isLoading || isPreparingMfa}
              onClick={() => void handleOAuthLogin('facebook')}
            >
              Facebook
            </SocialLoginButton>
          </div>
        </div>
      </AuthForm>

      {pendingMfaChallenge ? (
        <AuthModal
          title="Enter authenticator code"
          subtitle={`Use the 6-digit code from ${pendingMfaChallenge.factorName}.`}
          onClose={() => void handleCancelMfa()}
        >
          <form className="space-y-5" onSubmit={handleVerifyMfa}>
            <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-sm leading-5 text-[#64748B]">
              Signing in as{' '}
              <span className="font-medium text-[#0F172A]">{pendingMfaChallenge.email || email}</span>
            </div>

            {mfaError ? <AuthAlert>{mfaError}</AuthAlert> : null}

            <div>
              <label className="mb-3 block text-xs font-medium leading-4 text-[#475569]">
                6-digit authenticator PIN
              </label>
              <div className="grid grid-cols-6 gap-2">
                {mfaCode.map((digit, index) => (
                  <input
                    key={index}
                    ref={(element) => {
                      mfaInputRefs.current[index] = element;
                    }}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete={index === 0 ? 'one-time-code' : 'off'}
                    maxLength={1}
                    value={digit}
                    onChange={(event) => handleMfaDigitChange(index, event.target.value)}
                    onKeyDown={(event) => handleMfaKeyDown(index, event)}
                    onPaste={(event) => handleMfaPaste(index, event)}
                    disabled={isVerifyingMfa}
                    aria-label={`Authenticator digit ${index + 1}`}
                    className="h-12 rounded-lg border border-[#E2E8F0] bg-white text-center text-lg font-semibold text-[#0F172A] outline-none transition focus:border-[#1381FF] focus:ring-2 focus:ring-[#1381FF]/20 disabled:cursor-not-allowed disabled:bg-[#F8FAFC]"
                  />
                ))}
              </div>
              <p className="mt-3 text-xs leading-4 text-[#64748B]">
                Open your authenticator app and enter the current code before it expires.
              </p>
            </div>

            <PrimaryAuthButton
              loading={isVerifyingMfa}
              disabled={isVerifyingMfa || mfaCode.join('').length !== 6}
              loadingLabel="Verifying..."
            >
              Verify and log in
            </PrimaryAuthButton>

            <button
              type="button"
              onClick={() => void handleCancelMfa()}
              disabled={isVerifyingMfa}
              className="w-full text-center text-sm font-medium text-[#64748B] transition hover:text-[#0F172A] disabled:opacity-60"
            >
              Cancel login
            </button>
          </form>
        </AuthModal>
      ) : null}

      {isForgotPasswordOpen ? (
        <AuthModal
          title="Forgot password?"
          subtitle="Enter your email address and we will send a password reset link."
          onClose={closeForgotPasswordModal}
        >
          <div className="space-y-4">
            {forgotPasswordError ? <AuthAlert>{forgotPasswordError}</AuthAlert> : null}
            {forgotPasswordMessage ? <AuthAlert tone="success">{forgotPasswordMessage}</AuthAlert> : null}
            <form className="space-y-4" onSubmit={handleForgotPassword}>
              <InputField
                label="Email"
                type="email"
                placeholder="you@company.com"
                value={resetEmail}
                onChange={(event) => setResetEmail(event.target.value)}
                autoComplete="email"
                required
              />
              {hasTurnstileSiteKey ? (
                <TurnstileWidget
                  siteKey={clientConfig.turnstile.siteKey}
                  isLocalhost={clientConfig.turnstile.isLocalhost}
                  token={forgotPasswordCaptchaToken}
                  onTokenChange={setForgotPasswordCaptchaToken}
                  resetKey={forgotPasswordCaptchaResetKey}
                />
              ) : null}
              <PrimaryAuthButton
                loading={isSendingResetEmail}
                disabled={isSendingResetEmail}
                loadingLabel="Sending reset email..."
              >
                Send reset email
              </PrimaryAuthButton>
            </form>
          </div>
        </AuthModal>
      ) : null}

      {isRecoveryFlow ? (
        <AuthModal
          title={isInvitePasswordSetup ? 'Accept your invite' : 'Reset your password'}
          subtitle={
            isInvitePasswordSetup
              ? 'Set a password to activate your invited workspace account.'
              : 'Set a new password for your account.'
          }
          onClose={() => {
            window.history.replaceState({}, document.title, '/login');
            setIsRecoveryFlow(false);
            setIsInvitePasswordSetup(false);
            setRecoveryError('');
            setRecoveryMessage('');
          }}
        >
          <div className="space-y-4">
            {recoveryError ? <AuthAlert>{recoveryError}</AuthAlert> : null}
            {recoveryMessage ? <AuthAlert tone="success">{recoveryMessage}</AuthAlert> : null}
            <form className="space-y-4" onSubmit={handleUpdatePassword}>
              <PasswordField
                label="New password"
                placeholder="At least 6 characters"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                required
                minLength={6}
              />
              <PasswordField
                label="Confirm new password"
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                required
                minLength={6}
              />
              <PrimaryAuthButton
                loading={isUpdatingPassword}
                disabled={isUpdatingPassword}
                loadingLabel="Updating password..."
              >
                Update password
              </PrimaryAuthButton>
            </form>
          </div>
        </AuthModal>
      ) : null}
    </AuthLayout>
  );
}
