import type { WhatsAppCallPermissionAction, WhatsAppCallPermissionResponse } from './types';

const START_CALL_ACTION_NAMES = new Set(['start_call']);
const REQUEST_PERMISSION_ACTION_NAMES = new Set(['send_call_permission_request', 'call_permission_request']);
const START_CALL_PERMISSION_STATUSES = new Set([
  'accepted',
  'allow',
  'allowed',
  'approved',
  'granted',
  'permanent',
  'permanent_permission',
  'temporary',
  'temporary_permission',
]);

export function normalizeCallPermissionStatus(value: string | null | undefined) {
  return (value || '').trim().toLowerCase();
}

export function canStartCallFromPermissionStatus(value: string | null | undefined) {
  const normalizedStatus = normalizeCallPermissionStatus(value);
  return START_CALL_PERMISSION_STATUSES.has(normalizedStatus);
}

function findCallPermissionAction(
  response: WhatsAppCallPermissionResponse | null | undefined,
  actionNames: Set<string>,
) {
  return (response?.actions || []).find((action) => actionNames.has(String(action.actionName || '').toLowerCase())) || null;
}

function getBlockedActionLimit(action: WhatsAppCallPermissionAction | null) {
  return (action?.limits || []).find((limit) => limit.maxAllowed > 0 && limit.currentUsage >= limit.maxAllowed) || null;
}

export function canStartCallFromPermissionResponse(response: WhatsAppCallPermissionResponse | null | undefined) {
  const startCallAction = findCallPermissionAction(response, START_CALL_ACTION_NAMES);

  if (startCallAction?.canPerformAction) {
    return true;
  }

  return canStartCallFromPermissionStatus(response?.permission.status);
}

export function canRequestCallPermissionFromResponse(response: WhatsAppCallPermissionResponse | null | undefined) {
  const requestAction = findCallPermissionAction(response, REQUEST_PERMISSION_ACTION_NAMES);

  if (requestAction) {
    return requestAction.canPerformAction;
  }

  const permissionStatus = normalizeCallPermissionStatus(response?.permission.status);
  return permissionStatus === 'no_permission' || permissionStatus === 'denied' || permissionStatus === 'expired';
}

export function getCallPermissionUnavailableMessage(response: WhatsAppCallPermissionResponse | null | undefined) {
  const permissionStatus = normalizeCallPermissionStatus(response?.permission.status);
  const startLimit = getBlockedActionLimit(findCallPermissionAction(response, START_CALL_ACTION_NAMES));
  const requestLimit = getBlockedActionLimit(findCallPermissionAction(response, REQUEST_PERMISSION_ACTION_NAMES));

  if (startLimit) {
    return `This contact cannot be called right now because the start-call limit is reached (${startLimit.currentUsage}/${startLimit.maxAllowed}).`;
  }

  if (requestLimit) {
    return `This contact has not granted call permission yet, and the permission request limit is reached (${requestLimit.currentUsage}/${requestLimit.maxAllowed}).`;
  }

  switch (permissionStatus) {
    case 'no_permission':
    case 'denied':
      return 'This contact has not granted WhatsApp call permission yet.';
    case 'pending':
      return 'A WhatsApp call permission request is already waiting for this contact to approve.';
    case 'expired':
      return 'The previous WhatsApp call permission expired. Send a new permission request before calling.';
    default:
      return `This contact cannot be called right now. Current permission status: ${permissionStatus || 'unavailable'}.`;
  }
}
