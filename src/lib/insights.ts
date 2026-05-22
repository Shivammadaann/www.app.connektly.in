import type { InboxInsightsFilters } from './types';

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getTodayInboxInsightsFilters(now = new Date()): InboxInsightsFilters {
  const today = formatDateInput(now);

  return {
    startDate: today,
    endDate: today,
    channel: 'all',
  };
}

export function areInboxInsightsFiltersEqual(
  left: InboxInsightsFilters | null | undefined,
  right: InboxInsightsFilters | null | undefined,
) {
  if (!left || !right) {
    return false;
  }

  return (
    left.startDate === right.startDate &&
    left.endDate === right.endDate &&
    left.channel === right.channel
  );
}

export function isDefaultInboxInsightsFilters(filters: InboxInsightsFilters, now = new Date()) {
  return areInboxInsightsFiltersEqual(filters, getTodayInboxInsightsFilters(now));
}
