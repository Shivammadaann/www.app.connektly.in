import type { User } from '@supabase/supabase-js';

function readUserMetadataString(user: User | null | undefined, key: string) {
  const value = user?.user_metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function getAuthUserDisplayName(user: User | null | undefined) {
  return (
    readUserMetadataString(user, 'full_name') ||
    readUserMetadataString(user, 'name') ||
    readUserMetadataString(user, 'user_name') ||
    null
  );
}

export function getAuthUserProfilePictureUrl(user: User | null | undefined) {
  return (
    readUserMetadataString(user, 'avatar_url') ||
    readUserMetadataString(user, 'picture') ||
    readUserMetadataString(user, 'photo_url') ||
    readUserMetadataString(user, 'photoURL') ||
    null
  );
}

export function getAuthUserProviderLabel(user: User | null | undefined) {
  const provider = user?.app_metadata?.provider;

  if (provider === 'google') {
    return 'Google';
  }

  if (provider === 'facebook') {
    return 'Facebook';
  }

  return 'social sign-in';
}
