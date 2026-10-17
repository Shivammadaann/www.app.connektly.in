import type { ConversationMessage } from './types';

/** Imported chats and Business app activity do not open a Cloud API reply window. */
export function opensCustomerServiceWindow(message: Pick<ConversationMessage, 'direction' | 'messageType' | 'raw'>) {
  if (message.direction !== 'inbound' || message.messageType === 'call_summary') return false;
  const marker = message.raw?.connektly_coexistence;
  if (!marker || typeof marker !== 'object' || Array.isArray(marker)) return true;
  const state = marker as Record<string, unknown>;
  return state.historical !== true && state.affectsCustomerServiceWindow !== false;
}
