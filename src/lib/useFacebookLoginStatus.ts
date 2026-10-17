import { useSyncExternalStore } from 'react';
import { getFacebookLoginStatusSnapshot, subscribeToFacebookLoginStatus } from './meta-sdk';

export function useFacebookLoginStatus() {
  return useSyncExternalStore(
    subscribeToFacebookLoginStatus,
    getFacebookLoginStatusSnapshot,
    () => null,
  );
}
