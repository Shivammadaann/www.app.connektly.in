const RAZORPAY_CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

let razorpayCheckoutPromise: Promise<boolean> | null = null;

export interface RazorpaySubscriptionSuccessPayload {
  razorpay_payment_id: string;
  razorpay_signature: string;
  razorpay_subscription_id: string;
}

export interface RazorpayOrderSuccessPayload {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface RazorpayFailurePayload {
  error?: {
    description?: string;
    reason?: string;
  };
}

export interface RazorpayCheckoutInstance {
  open: () => void;
  on: (eventName: string, handler: (payload: RazorpayFailurePayload) => void) => void;
}

export interface RazorpayCheckoutConstructor {
  new (options: Record<string, unknown>): RazorpayCheckoutInstance;
}

declare global {
  interface Window {
    Razorpay?: RazorpayCheckoutConstructor;
  }
}

export function loadRazorpayCheckoutScript() {
  if (typeof window === 'undefined') {
    return Promise.resolve(false);
  }

  if (window.Razorpay) {
    return Promise.resolve(true);
  }

  if (razorpayCheckoutPromise) {
    return razorpayCheckoutPromise;
  }

  razorpayCheckoutPromise = new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${RAZORPAY_CHECKOUT_SRC}"]`);

    if (existing) {
      existing.addEventListener('load', () => resolve(Boolean(window.Razorpay)), { once: true });
      existing.addEventListener('error', () => resolve(false), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = RAZORPAY_CHECKOUT_SRC;
    script.async = true;
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

  return razorpayCheckoutPromise;
}

export function buildPrefillContact(countryCode: string | null | undefined, phone: string | null | undefined) {
  const parts = [countryCode?.trim(), phone?.trim()].filter(Boolean);
  return parts.length ? parts.join(' ') : undefined;
}
