import { useEffect, useRef, useState } from 'react';
import {
  checkFacebookLoginStatus,
  ensureMetaSdkReady,
  statusChangeCallback,
  type FacebookLoginStatusResponse,
} from '../../lib/meta-sdk';
import { useFacebookLoginStatus } from '../../lib/useFacebookLoginStatus';
import { SocialLoginButton } from './AuthComponents';

export default function FacebookLoginButton({
  loading = false,
  disabled = false,
  onContinue,
  onError,
}: {
  loading?: boolean;
  disabled?: boolean;
  onContinue: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const loginStatus = useFacebookLoginStatus();
  const [sdkState, setSdkState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const containerRef = useRef<HTMLDivElement>(null);
  const continuingRef = useRef(false);
  const propsRef = useRef({ loading, disabled, onContinue, onError });
  propsRef.current = { loading, disabled, onContinue, onError };

  const continueToApp = async (response?: FacebookLoginStatusResponse) => {
    if (propsRef.current.disabled || propsRef.current.loading || continuingRef.current) {
      return;
    }

    continuingRef.current = true;
    try {
      if (response) {
        statusChangeCallback(response);
        if (response.status !== 'connected' || !response.authResponse?.accessToken) {
          throw new Error('Facebook sign-in was cancelled. Please try again.');
        }
      }

      // Supabase completes its own OAuth flow to issue the Connektly session.
      // A standard Facebook web access token is not a Supabase OIDC ID token.
      await propsRef.current.onContinue();
    } catch (error) {
      propsRef.current.onError(error instanceof Error ? error.message : 'Facebook sign-in failed. Please try again.');
    } finally {
      continuingRef.current = false;
    }
  };

  useEffect(() => {
    let active = true;
    const handleLogin = (response?: FacebookLoginStatusResponse) => {
      if (!active) {
        return;
      }

      if (response) {
        statusChangeCallback(response);
      }

      if (propsRef.current.disabled || propsRef.current.loading || continuingRef.current) {
        return;
      }

      if (response) {
        void continueToApp(response);
      } else {
        void checkFacebookLoginStatus()
          .then((result) => {
            if (active) {
              void continueToApp(result);
            }
          })
          .catch((error) => {
            if (active) {
              propsRef.current.onError(error instanceof Error ? error.message : 'Could not check Facebook login status.');
            }
          });
      }
    };

    window.connektlyFacebookLogin = handleLogin;
    void ensureMetaSdkReady()
      .then(() => {
        if (active) setSdkState('ready');
      })
      .catch(() => {
        if (active) setSdkState('unavailable');
      });

    return () => {
      active = false;
      if (window.connektlyFacebookLogin === handleLogin) {
        delete window.connektlyFacebookLogin;
      }
    };
  }, []);

  useEffect(() => {
    if (sdkState !== 'ready' || loginStatus === 'connected' || loading || !containerRef.current) {
      return;
    }

    try {
      window.FB!.XFBML.parse(containerRef.current);
    } catch {
      setSdkState('unavailable');
    }
  }, [sdkState, loginStatus, loading]);

  if (sdkState !== 'ready' || loginStatus === 'connected' || loading) {
    return (
      <SocialLoginButton
        provider="facebook"
        loading={loading || sdkState === 'loading'}
        disabled={disabled || loading || sdkState === 'loading'}
        onClick={() => void continueToApp()}
      >
        Continue with Facebook
      </SocialLoginButton>
    );
  }

  return (
    <div
      ref={containerRef}
      aria-label="Continue with Facebook"
      aria-disabled={disabled}
      inert={disabled || undefined}
      className={`flex min-h-11 justify-center ${disabled ? 'opacity-60' : ''}`}
    >
      <div
        className="fb-login-button"
        data-auto-logout-link="false"
        data-onlogin="connektlyFacebookLogin"
        data-scope="public_profile,email"
        data-size="large"
        data-button-type="continue_with"
        data-layout="default"
        data-use-continue-as="false"
        data-width="240"
      />
    </div>
  );
}
