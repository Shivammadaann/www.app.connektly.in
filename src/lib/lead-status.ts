export const LEAD_STATUS_OPTIONS = [
  'New Lead',
  'Connected',
  'Not Connected',
  'Interested',
  'Not Interested',
  'Follow up Required',
  'Converted',
  'Invalid',
  'Duplicate',
] as const;

export type ConversationThreadStatus = (typeof LEAD_STATUS_OPTIONS)[number];

export function normalizeConversationThreadStatus(value: unknown): ConversationThreadStatus {
  if (typeof value !== 'string') {
    return 'New Lead';
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return 'New Lead';
  }

  const exactMatch = LEAD_STATUS_OPTIONS.find((status) => status === trimmed);

  if (exactMatch) {
    return exactMatch;
  }

  switch (trimmed.toLowerCase()) {
    case 'new':
    case 'new lead':
      return 'New Lead';
    case 'in progress':
    case 'connected':
      return 'Connected';
    case 'waiting':
    case 'follow-up required':
    case 'follow up required':
      return 'Follow up Required';
    case 'completed':
    case 'converted':
      return 'Converted';
    case 'not connected':
      return 'Not Connected';
    case 'interested':
      return 'Interested';
    case 'not interested':
      return 'Not Interested';
    case 'invalid':
      return 'Invalid';
    case 'duplicate':
      return 'Duplicate';
    default:
      return 'New Lead';
  }
}

export function getConversationThreadStatusClassName(status: ConversationThreadStatus) {
  switch (status) {
    case 'Connected':
      return 'border border-blue-100 bg-blue-50 text-blue-700';
    case 'Interested':
      return 'border border-violet-100 bg-violet-50 text-violet-700';
    case 'Follow up Required':
      return 'border border-amber-100 bg-amber-50 text-amber-700';
    case 'Converted':
      return 'border border-emerald-100 bg-emerald-50 text-emerald-700';
    case 'Not Connected':
      return 'border border-slate-200 bg-slate-100 text-slate-700';
    case 'Not Interested':
      return 'border border-gray-200 bg-gray-100 text-gray-700';
    case 'Invalid':
      return 'border border-red-100 bg-red-50 text-red-700';
    case 'Duplicate':
      return 'border border-stone-200 bg-stone-100 text-stone-700';
    case 'New Lead':
    default:
      return 'border border-emerald-100 bg-emerald-50 text-emerald-700';
  }
}
