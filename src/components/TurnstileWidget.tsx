import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          theme?: 'light' | 'dark' | 'auto';
          size?: 'normal' | 'flexible' | 'compact' | 'invisible';
          callback?: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: () => void;
        },
      ) => string;
      execute?: (widgetId?: string) => void;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

let turnstileScriptPromise: Promise<void> | null = null;

function loadTurnstileScript() {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }

  if (window.turnstile) {
    return Promise.resolve();
  }

  if (turnstileScriptPromise) {
    return turnstileScriptPromise;
  }

  turnstileScriptPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-turnstile-script="true"]',
    );

    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener(
        'error',
        () => reject(new Error('Failed to load Cloudflare Turnstile.')),
        { once: true },
      );
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.dataset.turnstileScript = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Cloudflare Turnstile.'));
    document.head.appendChild(script);
  });

  return turnstileScriptPromise;
}

function getTurnstileLoadMessage(isLocalhost: boolean) {
  if (isLocalhost) {
    return 'This Turnstile key is not loading on localhost. Add localhost and 127.0.0.1 to the widget hostnames in Cloudflare, or set VITE_TURNSTILE_LOCAL_SITE_KEY to a key that allows local testing.';
  }

  return 'Failed to load Cloudflare Turnstile.';
}

export default function TurnstileWidget({
  siteKey,
  onTokenChange,
  resetKey = 0,
  isLocalhost = false,
}: {
  siteKey: string;
  token: string | null;
  onTokenChange: (token: string | null) => void;
  resetKey?: number;
  isLocalhost?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    if (!siteKey || !containerRef.current) {
      setLoadError(
        isLocalhost
          ? 'Add a Turnstile site key for localhost testing before using auth on your local machine.'
          : null,
      );
      return;
    }

    void loadTurnstileScript()
      .then(() => {
        if (isCancelled || !window.turnstile || !containerRef.current) {
          return;
        }

        containerRef.current.innerHTML = '';
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: 'light',
          size: 'invisible',
          callback: (nextToken) => onTokenChange(nextToken),
          'expired-callback': () => onTokenChange(null),
          'error-callback': () => {
            onTokenChange(null);
            setLoadError(getTurnstileLoadMessage(isLocalhost));
          },
        });
        window.turnstile.execute?.(widgetIdRef.current);
        setLoadError(null);
      })
      .catch((error) => {
        if (!isCancelled) {
          setLoadError(
            error instanceof Error && !isLocalhost
              ? error.message
              : getTurnstileLoadMessage(isLocalhost),
          );
        }
      });

    return () => {
      isCancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [isLocalhost, onTokenChange, siteKey]);

  useEffect(() => {
    if (!widgetIdRef.current || !window.turnstile) {
      return;
    }

    onTokenChange(null);
    window.turnstile.reset(widgetIdRef.current);
    window.turnstile.execute?.(widgetIdRef.current);
  }, [onTokenChange, resetKey]);

  return (
    <>
      <div ref={containerRef} className="h-0 overflow-hidden" />
      {loadError ? (
        <div className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {loadError}
        </div>
      ) : null}
    </>
  );
}
