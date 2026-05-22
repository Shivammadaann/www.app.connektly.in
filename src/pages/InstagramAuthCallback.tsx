import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { META_CONFIGURED_LOGIN_EVENT } from '../lib/meta-sdk';

function getParam(
  hashParams: URLSearchParams,
  searchParams: URLSearchParams,
  key: string,
) {
  return hashParams.get(key) || searchParams.get(key);
}

export default function InstagramAuthCallback() {
  const [status, setStatus] = useState('Finishing Meta connection...');

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const searchParams = new URLSearchParams(window.location.search);
    const error =
      getParam(hashParams, searchParams, 'error_description') ||
      getParam(hashParams, searchParams, 'error_message') ||
      getParam(hashParams, searchParams, 'error_reason');

    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(
        {
          type: META_CONFIGURED_LOGIN_EVENT,
          state: getParam(hashParams, searchParams, 'state'),
          code: getParam(hashParams, searchParams, 'code'),
          error,
        },
        window.location.origin,
      );
    }

    setStatus(error ? error : 'Meta connection authorized. You can close this window.');

    const closeTimer = window.setTimeout(() => {
      window.close();
    }, 800);

    return () => window.clearTimeout(closeTimer);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f8fb] px-6">
      <div className="w-full max-w-md rounded-[2rem] border border-gray-200 bg-white px-8 py-10 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-pink-50 text-pink-600">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
        <h1 className="mt-6 text-2xl font-bold text-gray-900">Meta Connection</h1>
        <p className="mt-3 text-sm leading-6 text-gray-500">{status}</p>
      </div>
    </div>
  );
}
