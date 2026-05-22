function normalizeOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function normalizePhoneLike(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed || !/^[+\d\s().-]+$/.test(trimmed)) {
    return null;
  }

  const digitsOnly = trimmed.replace(/\D/g, '');
  return digitsOnly || null;
}

export function normalizeContactIdentity(value: unknown) {
  return normalizePhoneLike(value) || normalizeOptionalString(value);
}

export function formatContactIdentity(value: unknown) {
  const normalizedPhone = normalizePhoneLike(value);

  if (normalizedPhone) {
    return `+${normalizedPhone}`;
  }

  return normalizeOptionalString(value);
}
