export const WALLET_PRICING_OVERVIEW_URL = 'https://pricing.connektly.in';

export const WALLET_CURRENCY_OPTIONS = [
  { value: 'INR', label: 'Indian Rupee (INR)' },
  { value: 'USD', label: 'US Dollar (USD)' },
  { value: 'GBP', label: 'British Pound (GBP)' },
  { value: 'EUR', label: 'Euro (EUR)' },
  { value: 'AED', label: 'UAE Dirham (AED)' },
  { value: 'SGD', label: 'Singapore Dollar (SGD)' },
  { value: 'AUD', label: 'Australian Dollar (AUD)' },
] as const;

const CURRENCY_BY_CALLING_CODE: Record<string, string> = {
  '+1': 'USD',
  '+44': 'GBP',
  '+91': 'INR',
  '+61': 'AUD',
  '+81': 'USD',
  '+49': 'EUR',
  '+33': 'EUR',
};

export function getCurrencyLabel(currency: string | null | undefined) {
  const normalized = (currency || '').trim().toUpperCase();
  return WALLET_CURRENCY_OPTIONS.find((option) => option.value === normalized)?.label || normalized || 'US Dollar (USD)';
}

export function getPreferredCurrencyFromCallingCode(countryCode: string | null | undefined) {
  return CURRENCY_BY_CALLING_CODE[countryCode || ''] || 'USD';
}

export function normalizePreferredCurrency(currency: string | null | undefined) {
  const normalized = (currency || '').trim().toUpperCase();

  if (!normalized) {
    return null;
  }

  return WALLET_CURRENCY_OPTIONS.some((option) => option.value === normalized) ? normalized : null;
}

export function formatWalletAmount(amount: number, currency: string | null | undefined) {
  const normalizedCurrency = normalizePreferredCurrency(currency) || 'USD';
  const hasDecimals = Math.round(amount * 100) % 100 !== 0;

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: normalizedCurrency,
    maximumFractionDigits: hasDecimals ? 2 : 0,
    minimumFractionDigits: hasDecimals ? 2 : 0,
  }).format(amount);
}

export function formatWalletDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}
