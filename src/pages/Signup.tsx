import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCachedSession, supabase } from '../lib/supabase';
import { appApi } from '../lib/api';
import TurnstileWidget from '../components/TurnstileWidget';
import { clientConfig, hasTurnstileSiteKey } from '../lib/config';
import {
  AuthAlert,
  AuthForm,
  AuthLayout,
  AuthTransitionScreen,
  Divider,
  InputField,
  PasswordField,
  PrimaryAuthButton,
  SocialLoginButton,
} from '../components/auth/AuthComponents';

type OAuthProvider = 'google' | 'facebook';

function hasOAuthRedirectParams() {
  if (typeof window === 'undefined') {
    return false;
  }

  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const hashParams = new URLSearchParams(hash);
  const searchParams = new URLSearchParams(window.location.search);

  return Boolean(
    searchParams.get('code') ||
      hashParams.get('access_token') ||
      hashParams.get('refresh_token'),
  );
}

function getPasswordStrength(password: string) {
  const checks = [
    password.length >= 8,
    /[a-z]/.test(password) && /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const score = checks.filter(Boolean).length;

  if (!password) {
    return { score: 0, label: 'Use at least 8 characters.', toneClassName: 'bg-slate-200' };
  }

  if (score <= 1) {
    return { score, label: 'Weak password', toneClassName: 'bg-red-500' };
  }

  if (score === 2) {
    return { score, label: 'Fair password', toneClassName: 'bg-amber-500' };
  }

  if (score === 3) {
    return { score, label: 'Good password', toneClassName: 'bg-blue-500' };
  }

  return { score, label: 'Strong password', toneClassName: 'bg-emerald-500' };
}

export default function Signup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [oauthLoadingProvider, setOauthLoadingProvider] = useState<OAuthProvider | null>(null);
  const [isResolvingAuthRedirect, setIsResolvingAuthRedirect] = useState(hasOAuthRedirectParams);
  const navigate = useNavigate();

  useEffect(() => {
    getCachedSession().then((session) => {
      if (session) {
        setIsResolvingAuthRedirect(true);
        appApi
          .getBootstrap()
          .then((bootstrap) => {
            navigate(bootstrap.profile?.onboardingCompleted ? '/dashboard/home' : '/onboarding/plans');
          })
          .catch(() => {
            navigate('/dashboard/home');
          });
        return;
      }

      setIsResolvingAuthRedirect(false);
    });
  }, [navigate]);

  const passwordStrength = useMemo(() => getPasswordStrength(password), [password]);
  const canSubmitSignup = name.trim().length > 0 && email.trim().length > 0 && password.length >= 6;
  const isSuccessNotice = error.startsWith('Success!');

  const handleSignup = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      setError('Sign up is not configured yet. Add the required authentication values in Settings > Secrets.');
      return;
    }

    if (supabaseUrl === 'YOUR_SUPABASE_PROJECT_URL' || supabaseKey === 'YOUR_SUPABASE_ANON_KEY') {
      setError('Replace the placeholder authentication values in Settings > Secrets before creating an account.');
      return;
    }

    if (hasTurnstileSiteKey && !captchaToken) {
      setError('Security verification is still running. Please try again in a moment.');
      return;
    }

    setIsLoading(true);

    try {
      const signupPromise = supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name,
          },
          captchaToken: captchaToken || undefined,
        },
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out. Please check your internet connection and try again.')), 15000),
      );

      const { data, error } = await Promise.race([signupPromise, timeoutPromise]) as any;

      if (error) {
        throw error;
      }

      if (data?.user && !data?.session) {
        setError('Success! Please check your email to verify your account before logging in.');
        setCaptchaToken(null);
        setCaptchaResetKey((current) => current + 1);
      } else if (data?.user) {
        navigate('/onboarding/plans');
      } else {
        throw new Error('An unexpected error occurred during sign up.');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to sign up. Please try again.');
      setCaptchaResetKey((current) => current + 1);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOAuthSignup = async (provider: OAuthProvider) => {
    setError('');

    if (hasTurnstileSiteKey && !captchaToken) {
      setError(`Security verification is still running. Please try ${provider === 'google' ? 'Google' : 'Facebook'} again in a moment.`);
      return;
    }

    setOauthLoadingProvider(provider);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/signup`,
          ...(provider === 'google'
            ? {
                queryParams: {
                  prompt: 'select_account',
                },
              }
            : {}),
          ...(provider === 'facebook' ? { scopes: 'email,public_profile' } : {}),
          ...(captchaToken ? { captchaToken } : {}),
        } as any,
      });

      if (error) {
        throw error;
      }
    } catch (err: any) {
      setError(
        err?.message ||
          `Failed to start ${provider === 'google' ? 'Google' : 'Facebook'} sign up. Please try again.`,
      );
      setOauthLoadingProvider(null);
      setCaptchaResetKey((current) => current + 1);
    }
  };

  if (isResolvingAuthRedirect) {
    return (
      <AuthTransitionScreen
        title="Signing up"
        description="Google confirmed your account. Preparing your Connektly workspace."
      />
    );
  }

  return (
    <AuthLayout
      mode="signup"
      heroTitle={
        <>
          Do more with <span className="text-[#1381FF]">Ads</span> and{' '}
          <span className="text-[#1381FF]">Conversations</span>
        </>
      }
      heroDescription="Connektly keeps messages, campaigns, calls, leads, and notifications organized for fast-moving teams."
      switchText="Already have an account?"
      switchHref="/login"
      switchLabel="Log in"
    >
      <AuthForm
        eyebrow="Get started"
        title="Create your account"
        description="Use Google, Facebook, or create an account with your work email."
      >
        <div className="space-y-4">
          {error ? <AuthAlert tone={isSuccessNotice ? 'success' : 'error'}>{error}</AuthAlert> : null}

          <form className="space-y-4" onSubmit={handleSignup}>
            <InputField
              label="Name"
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              autoFocus
              required
            />

            <InputField
              label="Email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />

            <div>
              <PasswordField
                label="Password"
                placeholder="Create a password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                showCapsLockWarning
                required
                minLength={6}
              />
              <div className="mt-2">
                <div className="h-1.5 overflow-hidden rounded-full bg-[#E2E8F0]">
                  <div
                    className={`h-full rounded-full transition-all duration-200 ${passwordStrength.toneClassName}`}
                    style={{ width: `${Math.max(passwordStrength.score, password ? 1 : 0) * 25}%` }}
                  />
                </div>
                <p className="mt-1 text-xs leading-4 text-[#64748B]">{passwordStrength.label}</p>
              </div>
            </div>

            <p className="text-xs leading-4 text-[#64748B]">
              By signing up, you agree to Connektly's Terms and Privacy Policy. We may contact you about product updates and workspace setup.
            </p>

            {hasTurnstileSiteKey ? (
              <TurnstileWidget
                siteKey={clientConfig.turnstile.siteKey}
                isLocalhost={clientConfig.turnstile.isLocalhost}
                token={captchaToken}
                onTokenChange={setCaptchaToken}
                resetKey={captchaResetKey}
              />
            ) : null}

            <PrimaryAuthButton loading={isLoading} disabled={isLoading || !canSubmitSignup} loadingLabel="Creating account...">
              Create account
            </PrimaryAuthButton>
          </form>

          <Divider />

          <div className="grid grid-cols-2 gap-3">
            <SocialLoginButton
              provider="google"
              loading={oauthLoadingProvider === 'google'}
              disabled={oauthLoadingProvider !== null || isLoading}
              onClick={() => void handleOAuthSignup('google')}
            >
              Google
            </SocialLoginButton>

            <SocialLoginButton
              provider="facebook"
              loading={oauthLoadingProvider === 'facebook'}
              disabled={oauthLoadingProvider !== null || isLoading}
              onClick={() => void handleOAuthSignup('facebook')}
            >
              Facebook
            </SocialLoginButton>
          </div>
        </div>
      </AuthForm>
    </AuthLayout>
  );
}
