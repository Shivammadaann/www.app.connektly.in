import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { createPortal } from 'react-dom';
import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  CornerDownLeft,
  Loader2,
  Megaphone,
  Search,
  Send,
  X,
} from 'lucide-react';
import { appApi } from '../../lib/api';
import { useAppData } from '../../context/AppDataContext';
import { getConversationDisplayDetail, getConversationDisplayName } from '../../lib/conversation-display';
import ChannelBrandIcon from '../../components/ChannelBrandIcon';
import FeedbackPopupStack from '../../components/FeedbackPopupStack';
import CsvImportModal from '../../components/CsvImportModal';
import { DropdownSelect } from '../../components/ui/DropdownSelect';
import { useEscapeKey } from '../../lib/useEscapeKey';
import type { ConversationThread, MetaTemplate } from '../../lib/types';

const CAMPAIGNS_STORAGE_KEY = 'connektly-campaigns';
const LEGACY_BROADCASTS_STORAGE_KEY = 'connektly-broadcasts';

type AudienceSource = 'contacts' | 'csv';
type BroadcastTiming = 'now' | 'later';
type BroadcastStatus = 'Queued' | 'Scheduled' | 'Submitted' | 'Sent' | 'Partial' | 'Failed';

interface AudienceImportRow {
  id: string;
  name: string;
  phone: string;
  labels: string[];
}

interface PastBroadcastRecord {
  id: string;
  campaignName: string;
  templateId: string;
  templateName: string;
  audienceCount: number;
  audienceSource: AudienceSource;
  timing: BroadcastTiming;
  scheduledFor: string | null;
  status: BroadcastStatus;
  sentCount?: number;
  failedCount?: number;
  optedOutCount?: number;
  heldForQualityAssessmentCount?: number;
  pausedCount?: number;
  note?: string | null;
  createdAt: string;
}

interface BroadcastComposerState {
  campaignName: string;
  templateId: string;
  audienceSource: AudienceSource;
  timing: BroadcastTiming;
  scheduledDate: string;
  scheduledTime: string;
}

const SAMPLE_AUDIENCE_CSV = ['name,phone,labels'].join('\r\n');

function getInitialPastBroadcasts() {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw =
      window.localStorage.getItem(CAMPAIGNS_STORAGE_KEY) ||
      window.localStorage.getItem(LEGACY_BROADCASTS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PastBroadcastRecord[]) : [];
  } catch {
    return [];
  }
}

function createEmptyComposerState(): BroadcastComposerState {
  return {
    campaignName: '',
    templateId: '',
    audienceSource: 'contacts',
    timing: 'now',
    scheduledDate: '',
    scheduledTime: '',
  };
}

function normalizeCsvHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseCsvText(text: string) {
  const rows: string[][] = [];
  let currentCell = '';
  let currentRow: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === '"') {
      if (inQuotes && text[index + 1] === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && text[index + 1] === '\n') {
        index += 1;
      }

      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
      continue;
    }

    currentCell += char;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows.filter((row) => row.some((cell) => cell.trim() !== ''));
}

function parseCsvRecords(text: string) {
  const rows = parseCsvText(text);

  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0].map(normalizeCsvHeader);

  return rows.slice(1).map((row) =>
    headers.reduce<Record<string, string>>((record, header, index) => {
      record[header] = (row[index] || '').trim();
      return record;
    }, {}),
  );
}

function getRecordValue(record: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = record[normalizeCsvHeader(key)];

    if (value) {
      return value.trim();
    }
  }

  return '';
}

function parseLabels(value: string) {
  return value
    .split(/[|,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getTemplateComponents(raw: Record<string, unknown> | null | undefined) {
  if (!raw) {
    return [];
  }

  const components = raw.components;

  return Array.isArray(components)
    ? components.filter(
        (component): component is Record<string, unknown> =>
          Boolean(component) && typeof component === 'object' && !Array.isArray(component),
      )
    : [];
}

function normalizeTemplateSnapshot(raw: Record<string, unknown> | null | undefined, fallbackName?: string | null) {
  const components = getTemplateComponents(raw);

  if (components.length === 0 && !fallbackName) {
    return null;
  }

  return {
    name: typeof raw?.name === 'string' ? raw.name : fallbackName || null,
    components,
  };
}

function getTemplateTextComponent(
  snapshot: ReturnType<typeof normalizeTemplateSnapshot>,
  type: 'HEADER' | 'BODY' | 'FOOTER',
) {
  if (!snapshot) {
    return null;
  }

  return snapshot.components.find((component) => component.type === type) || null;
}

function getTemplateButtons(snapshot: ReturnType<typeof normalizeTemplateSnapshot>) {
  if (!snapshot) {
    return [];
  }

  const buttonsComponent = snapshot.components.find((component) => component.type === 'BUTTONS');
  const buttons = buttonsComponent?.buttons;

  return Array.isArray(buttons)
    ? buttons.filter(
        (button): button is Record<string, unknown> =>
          Boolean(button) && typeof button === 'object' && !Array.isArray(button),
      )
    : [];
}

function templateRequiresParameterMapping(template: MetaTemplate | null) {
  if (!template) {
    return false;
  }

  return /\{\{\d+\}\}/.test(JSON.stringify(template.raw || {}));
}

function getBroadcastStatusClasses(status: BroadcastStatus) {
  switch (status) {
    case 'Scheduled':
      return 'border border-amber-100 bg-amber-50 text-amber-700';
    case 'Submitted':
    case 'Sent':
      return 'border border-emerald-100 bg-emerald-50 text-emerald-700';
    case 'Failed':
      return 'border border-red-100 bg-red-50 text-red-700';
    case 'Partial':
      return 'border border-sky-100 bg-sky-50 text-sky-700';
    default:
      return 'border border-blue-100 bg-blue-50 text-blue-700';
  }
}

function getBroadcastOutcomeSummary(broadcast: PastBroadcastRecord) {
  if (broadcast.note) {
    return broadcast.note;
  }

  const parts: string[] = [];

  if (typeof broadcast.sentCount === 'number') {
    parts.push(`${broadcast.sentCount} accepted by Meta`);
  }

  if ((broadcast.heldForQualityAssessmentCount || 0) > 0) {
    parts.push(`${broadcast.heldForQualityAssessmentCount} held`);
  }

  if ((broadcast.pausedCount || 0) > 0) {
    parts.push(`${broadcast.pausedCount} paused`);
  }

  if ((broadcast.failedCount || 0) > 0) {
    parts.push(`${broadcast.failedCount} failed`);
  }

  if ((broadcast.optedOutCount || 0) > 0) {
    parts.push(`${broadcast.optedOutCount} opted out`);
  }

  return parts.join(' - ');
}

function RichText({ value }: { value: string }) {
  const lines = value.split('\n');

  const renderInline = (line: string) => {
    const parts = line.split(/(\*[^*]+\*|_[^_]+_)/g).filter(Boolean);

    return parts.map((part, index) => {
      if (part.startsWith('*') && part.endsWith('*')) {
        return (
          <strong key={`${part}-${index}`} className="font-semibold">
            {part.slice(1, -1)}
          </strong>
        );
      }

      if (part.startsWith('_') && part.endsWith('_')) {
        return (
          <em key={`${part}-${index}`} className="italic">
            {part.slice(1, -1)}
          </em>
        );
      }

      return <span key={`${part}-${index}`}>{part}</span>;
    });
  };

  return (
    <>
      {lines.map((line, index) => (
        <span key={`${line}-${index}`}>
          {renderInline(line)}
          {index < lines.length - 1 ? <br /> : null}
        </span>
      ))}
    </>
  );
}

function TemplatePreviewCard({ template }: { template: MetaTemplate | null }) {
  const snapshot = normalizeTemplateSnapshot(template?.raw || null, template?.name || 'Select a template');
  const headerComponent = getTemplateTextComponent(snapshot, 'HEADER');
  const bodyComponent = getTemplateTextComponent(snapshot, 'BODY');
  const footerComponent = getTemplateTextComponent(snapshot, 'FOOTER');
  const buttons = getTemplateButtons(snapshot);
  const headerText = typeof headerComponent?.text === 'string' ? headerComponent.text.trim() : '';
  const headerFormat = typeof headerComponent?.format === 'string' ? headerComponent.format : null;
  const bodyText = typeof bodyComponent?.text === 'string' ? bodyComponent.text.trim() : '';
  const footerText = typeof footerComponent?.text === 'string' ? footerComponent.text.trim() : '';

  return (
    <div className="mx-auto w-full max-w-[340px] rounded-[2.25rem] bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
      <div className="rounded-[1.8rem] border border-gray-100 bg-[#f7f7f5] p-4">
        <div className="mb-4 flex items-center justify-between border-b border-gray-200 pb-3">
          <div className="flex items-center gap-2">
            <ChannelBrandIcon channel="whatsapp" className="h-10 w-10 shrink-0" alt="" />
            <div>
              <p className="text-sm font-semibold text-gray-900">Connektly</p>
              <p className="text-[11px] text-gray-500">Campaign preview</p>
            </div>
          </div>
          <div className="text-xs text-gray-400">12:04</div>
        </div>

        <div className="mb-4 rounded-2xl bg-[#dff3f2] px-4 py-3 text-xs text-[#52656f]">
          This business uses a secure service from Meta to manage this chat. Tap to learn more
        </div>

        <div className="rounded-[1.5rem] bg-white p-5 shadow-sm">
          {headerFormat && headerFormat !== 'TEXT' ? (
            <div className="mb-4 rounded-2xl bg-gray-100 px-4 py-10 text-center text-sm font-medium text-gray-500">
              {headerFormat.charAt(0) + headerFormat.slice(1).toLowerCase()} header preview
            </div>
          ) : null}

          {headerText ? (
            <div className="mb-4 text-[1.02rem] font-bold text-gray-900">
              <RichText value={headerText} />
            </div>
          ) : null}

          <div className="text-[1rem] leading-7 text-gray-900">
            <RichText value={bodyText || snapshot?.name || 'Select an approved template to preview it here.'} />
          </div>

          {footerText ? (
            <div className="mt-3 flex items-end justify-between gap-3">
              <p className="text-sm text-gray-500">
                <RichText value={footerText} />
              </p>
              <span className="text-sm text-gray-400">12:04</span>
            </div>
          ) : null}

          {buttons.length > 0 ? (
            <div className="mt-4 space-y-2 border-t border-gray-100 pt-4">
              {buttons.map((button, index) => {
                const text = typeof button.text === 'string' ? button.text : `Action ${index + 1}`;
                const type = typeof button.type === 'string' ? button.type : 'QUICK_REPLY';

                return (
                  <div
                    key={`${text}-${index}`}
                    className="flex items-center justify-center gap-2 text-center text-[0.98rem] font-medium text-[#4e8ed8]"
                  >
                    {type === 'URL' ? <ArrowUpRight className="h-4 w-4" /> : <CornerDownLeft className="h-4 w-4" />}
                    <span>{text}</span>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-xl font-bold text-gray-900">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-gray-500">{description}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function PastCampaignsModal({
  isOpen,
  onClose,
  pastBroadcasts,
}: {
  isOpen: boolean;
  onClose: () => void;
  pastBroadcasts: PastBroadcastRecord[];
}) {
  useEscapeKey(isOpen, onClose);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (!isOpen || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[140] overflow-y-auto">
        <motion.button
          type="button"
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
        />
        <div className="relative flex min-h-full items-center justify-center px-4 py-6">
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            className="relative z-10 w-full max-w-6xl overflow-hidden rounded-[30px] border border-white/50 bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Past Campaigns</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Review launched or scheduled campaigns and their current status.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
                aria-label="Close past campaigns"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[calc(90vh-88px)] overflow-y-auto">
              <div className="flex items-center justify-between gap-4 border-b border-gray-100 px-6 py-4">
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                  {pastBroadcasts.length} total
                </span>
              </div>

              {pastBroadcasts.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Campaign</th>
                        <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Template</th>
                        <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Audience</th>
                        <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Delivery</th>
                        <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {pastBroadcasts.map((broadcast) => (
                        <tr key={broadcast.id} className="hover:bg-gray-50/80">
                          <td className="px-6 py-4">
                            <p className="text-sm font-semibold text-gray-900">{broadcast.campaignName}</p>
                            <p className="mt-1 text-xs text-gray-500">
                              Created {new Date(broadcast.createdAt).toLocaleString()}
                            </p>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-700">{broadcast.templateName}</td>
                          <td className="px-6 py-4 text-sm text-gray-700">
                            {broadcast.audienceCount} recipients
                            <p className="mt-1 text-xs text-gray-500">
                              Source: {broadcast.audienceSource === 'contacts' ? 'Contacts list' : 'CSV import'}
                            </p>
                            {getBroadcastOutcomeSummary(broadcast) ? (
                              <p className="mt-1 text-xs text-gray-500">{getBroadcastOutcomeSummary(broadcast)}</p>
                            ) : null}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-700">
                            {broadcast.timing === 'later' && broadcast.scheduledFor
                              ? new Date(broadcast.scheduledFor).toLocaleString()
                              : 'Send now'}
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getBroadcastStatusClasses(
                                broadcast.status,
                              )}`}
                            >
                              {broadcast.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="px-6 py-14 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
                    <Megaphone className="h-6 w-6" />
                  </div>
                  <p className="mt-4 text-sm font-semibold text-gray-900">No campaigns yet</p>
                  <p className="mt-2 text-sm text-gray-500">
                    Create your first campaign and it will appear here with its current status.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </AnimatePresence>,
    document.body,
  );
}

export default function Broadcasts() {
  const { bootstrap, refresh } = useAppData();
  const [isPastCampaignsModalOpen, setIsPastCampaignsModalOpen] = useState(false);
  const [composer, setComposer] = useState<BroadcastComposerState>(createEmptyComposerState);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [importedAudience, setImportedAudience] = useState<AudienceImportRow[]>([]);
  const [audienceSearchQuery, setAudienceSearchQuery] = useState('');
  const deferredAudienceQuery = useDeferredValue(audienceSearchQuery);
  const [pastBroadcasts, setPastBroadcasts] = useState<PastBroadcastRecord[]>(getInitialPastBroadcasts);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const [isCsvImportOpen, setIsCsvImportOpen] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);

  const contacts = bootstrap?.conversations || [];
  const approvedTemplates = useMemo(
    () =>
      (bootstrap?.templates || []).filter(
        (template) =>
          (template.status || '').toLowerCase().includes('approve') &&
          (template.category || '').toUpperCase() === 'MARKETING',
      ),
    [bootstrap?.templates],
  );
  const selectedTemplate =
    approvedTemplates.find((template) => template.id === composer.templateId) || null;
  const selectedTemplateRequiresParameterMapping = useMemo(
    () => templateRequiresParameterMapping(selectedTemplate),
    [selectedTemplate],
  );
  const filteredAudienceContacts = useMemo(() => {
    const normalizedQuery = deferredAudienceQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return contacts;
    }

    return contacts.filter((contact) => {
      const haystack = [
        contact.contactName,
        contact.displayPhone,
        contact.contactWaId,
        contact.labels.join(' '),
        contact.marketingOptedOut ? 'marketing opted out' : 'marketing opted in',
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [contacts, deferredAudienceQuery]);

  const audienceCount =
    composer.audienceSource === 'contacts' ? selectedContactIds.length : importedAudience.length;

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(CAMPAIGNS_STORAGE_KEY, JSON.stringify(pastBroadcasts));
  }, [pastBroadcasts]);

  const updateComposer = <K extends keyof BroadcastComposerState>(
    field: K,
    value: BroadcastComposerState[K],
  ) => {
    setComposer((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const resetComposer = () => {
    setComposer(createEmptyComposerState());
    setSelectedContactIds([]);
    setImportedAudience([]);
    setAudienceSearchQuery('');
    setError(null);
  };

  const handleToggleContactSelection = (contactId: string) => {
    const contact = contacts.find((item) => item.id === contactId);

    if (contact?.marketingOptedOut) {
      setError('This contact is opted out of WhatsApp marketing campaigns.');
      setNotice(null);
      return;
    }

    setSelectedContactIds((current) =>
      current.includes(contactId)
        ? current.filter((id) => id !== contactId)
        : [...current, contactId],
    );
  };

  const handleImportAudienceCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];

    if (!file) {
      return;
    }

    try {
      setIsImportingCsv(true);
      setError(null);
      setNotice(null);
      const text = await file.text();
      const records = parseCsvRecords(text);

      if (records.length === 0) {
        throw new Error('The CSV file is empty or missing data rows.');
      }

      const importedRows = records
        .map((record, index) => {
          const phone = getRecordValue(record, ['phone', 'displayPhone', 'whatsAppNumber']);

          if (!phone) {
            return null;
          }

          return {
            id: `${phone}-${index}`,
            name: getRecordValue(record, ['name', 'contactName']) || `Imported Contact ${index + 1}`,
            phone,
            labels: parseLabels(getRecordValue(record, ['labels'])),
          } satisfies AudienceImportRow;
        })
        .filter((record): record is AudienceImportRow => Boolean(record));

      if (importedRows.length === 0) {
        throw new Error('No valid phone numbers were found in the CSV file.');
      }

      setImportedAudience(importedRows);
      setComposer((current) => ({
        ...current,
        audienceSource: 'csv',
      }));
      setNotice(`Imported ${importedRows.length} audience contacts from CSV.`);
      setIsCsvImportOpen(false);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to import audience CSV.');
    } finally {
      setIsImportingCsv(false);
      event.currentTarget.value = '';
    }
  };

  const handleLaunchBroadcast = async () => {
    if (!composer.campaignName.trim()) {
      setError('A campaign name is required.');
      return;
    }

    if (!selectedTemplate) {
      setError('Select an approved marketing template message before launching.');
      return;
    }

    if (audienceCount === 0) {
      setError('Choose at least one audience contact or import a CSV audience list.');
      return;
    }

    if (selectedTemplateRequiresParameterMapping) {
      setError(
        'This marketing template uses dynamic variables. Campaign parameter mapping is not supported yet.',
      );
      return;
    }

    if (composer.timing === 'later' && (!composer.scheduledDate || !composer.scheduledTime)) {
      setError('Choose both the schedule date and schedule time.');
      return;
    }

    try {
      setIsLaunching(true);
      setError(null);
      setNotice(null);

      const scheduledFor =
        composer.timing === 'later'
          ? new Date(`${composer.scheduledDate}T${composer.scheduledTime}`).toISOString()
          : null;

      if (composer.timing === 'later') {
        const nextBroadcast: PastBroadcastRecord = {
          id: crypto.randomUUID(),
          campaignName: composer.campaignName.trim(),
          templateId: selectedTemplate.id,
          templateName: selectedTemplate.name,
          audienceCount,
          audienceSource: composer.audienceSource,
          timing: composer.timing,
          scheduledFor,
          status: 'Scheduled',
          note: 'Saved locally only. Automatic campaign scheduling is not active yet.',
          createdAt: new Date().toISOString(),
        };

        setPastBroadcasts((current) => [nextBroadcast, ...current]);
        resetComposer();
        setNotice(
          'Campaign saved as scheduled. Automatic execution is coming next, so this one will not send by itself yet.',
        );
        return;
      }

      const recipients =
        composer.audienceSource === 'contacts'
          ? selectedContactIds
              .map((contactId) => contacts.find((contact) => contact.id === contactId) || null)
              .filter((contact): contact is ConversationThread => Boolean(contact))
              .map((contact) => ({
                to: contact.displayPhone || contact.contactWaId,
                contactName: contact.contactName,
                threadId: contact.id,
              }))
          : importedAudience.map((contact) => ({
              to: contact.phone,
              contactName: contact.name,
            }));

      if (recipients.length === 0) {
        throw new Error('No valid recipients are available for this campaign.');
      }

      const response = await appApi.launchMarketingCampaign({
        campaignName: composer.campaignName.trim(),
        templateName: selectedTemplate.name,
        language: selectedTemplate.language,
        recipients,
      });
      const nextStatus: BroadcastStatus =
        response.failedCount >= response.audienceCount
          ? 'Failed'
          : response.failedCount > 0 ||
              response.heldForQualityAssessmentCount > 0 ||
              response.pausedCount > 0
            ? 'Partial'
            : 'Submitted';
      const nextBroadcast: PastBroadcastRecord = {
        id: crypto.randomUUID(),
        campaignName: response.campaignName,
        templateId: selectedTemplate.id,
        templateName: response.templateName,
        audienceCount: response.audienceCount,
        audienceSource: composer.audienceSource,
        timing: composer.timing,
        scheduledFor: null,
        status: nextStatus,
        sentCount: response.sentCount,
        failedCount: response.failedCount,
        optedOutCount: response.optedOutCount,
        heldForQualityAssessmentCount: response.heldForQualityAssessmentCount,
        pausedCount: response.pausedCount,
        createdAt: new Date().toISOString(),
      };

      setPastBroadcasts((current) => [nextBroadcast, ...current]);
      await refresh();
      const finalError =
        nextStatus === 'Failed'
          ? 'Campaign execution finished, but every recipient failed. Review the campaign history and channel setup before retrying.'
          : null;
      let finalNotice: string | null = null;

      if (!finalError) {
        const outcomeParts = [`${response.sentCount} accepted by Meta`];

        if (response.heldForQualityAssessmentCount > 0) {
          outcomeParts.push(
            `${response.heldForQualityAssessmentCount} held for quality assessment`,
          );
        }

        if (response.pausedCount > 0) {
          outcomeParts.push(`${response.pausedCount} paused`);
        }

        if (response.failedCount > 0) {
          outcomeParts.push(`${response.failedCount} failed`);
        }

        if (response.optedOutCount > 0) {
          outcomeParts.push(`${response.optedOutCount} opted out`);
        }

        finalNotice = `Campaign execution started. ${outcomeParts.join(' - ')}.`;
      }

      resetComposer();
      if (finalError) {
        setError(finalError);
      }
      if (finalNotice) {
        setNotice(finalNotice);
      }
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
          <p className="mt-1 text-sm text-gray-500">
            Build WhatsApp campaigns with approved marketing templates, a chosen audience, and flexible timing.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsPastCampaignsModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-[#111827] px-4 py-3 text-sm font-medium text-white shadow-lg shadow-gray-900/15 transition hover:bg-[#1f2937]"
        >
          <Megaphone className="h-4 w-4" />
          View Past Campaigns
        </button>
      </div>

      <FeedbackPopupStack
        items={[
          ...(error ? [{ id: 'broadcasts-error', tone: 'error' as const, message: error, onDismiss: () => setError(null) }] : []),
          ...(notice ? [{ id: 'broadcasts-notice', tone: 'success' as const, message: notice, onDismiss: () => setNotice(null) }] : []),
        ]}
      />

      {isCsvImportOpen ? (
        <CsvImportModal
          title="Import Audience CSV"
          description="Upload a CSV using the required headers below. Download the blank sample CSV first if you need the correct structure."
          sampleFilename="campaign-audience-sample.csv"
          sampleCsv={SAMPLE_AUDIENCE_CSV}
          isImporting={isImportingCsv}
          onClose={() => setIsCsvImportOpen(false)}
          onImport={handleImportAudienceCsv}
        />
      ) : null}

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]"
      >
            <div className="space-y-6">
              <SectionCard
                title="What message do you want to send?"
                description="Give the campaign a clear name and choose an approved WhatsApp marketing template message."
              >
                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Campaign Name</label>
                    <input
                      type="text"
                      value={composer.campaignName}
                      onChange={(event) => updateComposer('campaignName', event.target.value)}
                      placeholder="Festival Promo - April"
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Select Marketing Template</label>
                    <DropdownSelect
                      value={composer.templateId}
                      onChange={(nextTemplateId) => updateComposer('templateId', nextTemplateId)}
                      options={[
                        { value: '', label: 'Choose an approved marketing template' },
                        ...approvedTemplates.map((template) => ({
                          value: template.id,
                          label: template.name,
                        })),
                      ]}
                      placeholder="Choose an approved marketing template"
                      ariaLabel="Select marketing template"
                      buttonClassName="rounded-xl border-gray-200 bg-gray-50 px-4 py-2.5 focus:border-[#5b45ff] focus:ring-[#5b45ff]/15"
                    />
                  </div>
                </div>

                {approvedTemplates.length === 0 ? (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    No approved marketing templates are available yet. Approve a marketing template first in the Templates section.
                  </div>
                ) : null}

                {selectedTemplateRequiresParameterMapping ? (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    This template includes dynamic variables. Campaign parameter mapping is not available yet, so choose a static marketing template for now.
                  </div>
                ) : null}
              </SectionCard>

              <SectionCard
                title="Who is your audience?"
                description="Pick contacts from your workspace or import a CSV audience list. You can also download a sample CSV first."
              >
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => updateComposer('audienceSource', 'contacts')}
                    className={`rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                      composer.audienceSource === 'contacts'
                        ? 'bg-[#5b45ff] text-white'
                        : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Select From Contacts
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateComposer('audienceSource', 'csv');
                      setIsCsvImportOpen(true);
                    }}
                    className={`rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                      composer.audienceSource === 'csv'
                        ? 'bg-[#5b45ff] text-white'
                        : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Import Contacts via CSV
                  </button>
                </div>

                {composer.audienceSource === 'contacts' ? (
                  <div className="mt-5 space-y-4">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={audienceSearchQuery}
                        onChange={(event) => setAudienceSearchQuery(event.target.value)}
                        placeholder="Search contacts by name, phone, or label"
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                      />
                    </div>

                    <div className="max-h-[320px] overflow-y-auto rounded-2xl border border-gray-200">
                      {filteredAudienceContacts.length > 0 ? (
                        filteredAudienceContacts.map((contact) => {
                          const isSelected = selectedContactIds.includes(contact.id);
                          const isMarketingOptedOut = contact.marketingOptedOut;

                          return (
                            <label
                              key={contact.id}
                              className={`flex items-start gap-3 border-b border-gray-100 px-4 py-3 text-sm last:border-b-0 ${
                                isMarketingOptedOut
                                  ? 'cursor-not-allowed bg-gray-50/80 opacity-70'
                                  : isSelected
                                    ? 'cursor-pointer bg-[#f5f3ff]'
                                    : 'cursor-pointer hover:bg-gray-50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={isMarketingOptedOut}
                                onChange={() => handleToggleContactSelection(contact.id)}
                                className="mt-1 h-4 w-4 rounded border-gray-300 text-[#5b45ff] focus:ring-[#5b45ff]"
                              />
                              <div className="min-w-0">
                                <p className="font-medium text-gray-900">
                                  {getConversationDisplayName(contact)}
                                </p>
                                <p className="mt-1 text-xs text-gray-500">
                                  {getConversationDisplayDetail(contact) || contact.displayPhone || contact.contactWaId}
                                </p>
                                {isMarketingOptedOut ? (
                                  <span className="mt-2 inline-flex rounded-full border border-rose-100 bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-700">
                                    Marketing opted out
                                  </span>
                                ) : null}
                              </div>
                            </label>
                          );
                        })
                      ) : (
                        <div className="px-4 py-10 text-center text-sm text-gray-500">
                          No contacts match your search.
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 space-y-4">
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => setIsCsvImportOpen(true)}
                        disabled={isImportingCsv}
                        className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
                      >
                        {isImportingCsv ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Import Audience CSV
                      </button>
                    </div>

                    <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
                      <p className="text-sm font-medium text-gray-900">Imported audience</p>
                      <p className="mt-1 text-sm text-gray-500">
                        {importedAudience.length > 0
                          ? `${importedAudience.length} contacts are ready for this campaign.`
                          : 'No CSV audience has been imported yet.'}
                      </p>
                    </div>

                    {importedAudience.length > 0 ? (
                      <div className="max-h-[320px] overflow-y-auto rounded-2xl border border-gray-200 bg-white">
                        {importedAudience.map((row) => (
                          <div key={row.id} className="border-b border-gray-100 px-4 py-3 last:border-b-0">
                            <p className="text-sm font-medium text-gray-900">{row.name}</p>
                            <p className="mt-1 text-xs text-gray-500">{row.phone}</p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </SectionCard>

              <SectionCard
                title="When do you want to send it?"
                description="Choose whether to send immediately or save the campaign for later. Automatic scheduled execution is not live yet."
              >
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => updateComposer('timing', 'now')}
                      className={`rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                        composer.timing === 'now'
                          ? 'bg-[#5b45ff] text-white'
                          : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <Send className="mr-2 inline h-4 w-4" />
                      Send Now
                    </button>
                    <button
                      type="button"
                      onClick={() => updateComposer('timing', 'later')}
                      className={`rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                        composer.timing === 'later'
                          ? 'bg-[#5b45ff] text-white'
                          : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <CalendarDays className="mr-2 inline h-4 w-4" />
                      Schedule For Later
                    </button>
                  </div>

                  {composer.timing === 'later' ? (
                    <div className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700">Date</label>
                          <input
                            type="date"
                            value={composer.scheduledDate}
                            onChange={(event) => updateComposer('scheduledDate', event.target.value)}
                            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700">Time</label>
                          <input
                            type="time"
                            value={composer.scheduledTime}
                            onChange={(event) => updateComposer('scheduledTime', event.target.value)}
                            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                          />
                        </div>
                      </div>
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        Scheduled campaigns are only saved inside Connektly right now. They will not auto-send until the scheduler is implemented.
                      </div>
                    </div>
                  ) : null}
                </div>
              </SectionCard>

              <div className="flex items-center justify-between rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Ready to launch?</p>
                  <p className="mt-1 text-sm text-gray-500">
                    Campaign: {composer.campaignName || 'Not named yet'} - Audience: {audienceCount} recipient{audienceCount === 1 ? '' : 's'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleLaunchBroadcast()}
                  disabled={isLaunching}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#111827] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#1f2937] disabled:opacity-60"
                >
                  {isLaunching ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Launch Campaign
                </button>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm lg:sticky lg:top-6">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#5b45ff]">Live Preview</p>
                    <h3 className="mt-2 text-lg font-bold text-gray-900">
                      {selectedTemplate?.name || 'Template preview'}
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      See the selected approved marketing template exactly as it would appear in WhatsApp.
                    </p>
                  </div>
                  <div className="rounded-2xl bg-[#f5f3ff] px-3 py-2 text-right">
                    <p className="text-xs font-medium uppercase tracking-wide text-[#5b45ff]">Audience</p>
                    <p className="mt-1 text-lg font-bold text-[#2b1f77]">{audienceCount}</p>
                  </div>
                </div>

                <TemplatePreviewCard template={selectedTemplate} />

                <div className="mt-5 grid gap-3">
                  <div className="rounded-2xl bg-gray-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Audience source</p>
                    <p className="mt-2 text-sm font-medium text-gray-900">
                      {composer.audienceSource === 'contacts' ? 'Workspace contacts' : 'CSV import'}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-gray-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Delivery</p>
                    <p className="mt-2 text-sm font-medium text-gray-900">
                      {composer.timing === 'later' && composer.scheduledDate && composer.scheduledTime
                        ? `${composer.scheduledDate} at ${composer.scheduledTime}`
                        : 'Send immediately'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
      </motion.section>

      <PastCampaignsModal
        isOpen={isPastCampaignsModalOpen}
        onClose={() => setIsPastCampaignsModalOpen(false)}
        pastBroadcasts={pastBroadcasts}
      />
    </div>
  );
}
