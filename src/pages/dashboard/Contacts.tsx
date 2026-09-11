import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CirclePlus,
  Download,
  Eye,
  FileUp,
  Filter,
  Loader2,
  Pencil,
  Search,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { appApi } from '../../lib/api';
import { useAppData } from '../../context/AppDataContext';
import { formatContactIdentity } from '../../lib/phone';
import {
  buildOwnerOptions,
  buildPhoneFromForm,
  buildSourceOptions,
  COUNTRY_DIAL_CODE_SELECT_OPTIONS,
  splitPhoneForForm,
  type SelectOption,
} from '../../lib/crm-form-options';
import {
  getConversationDisplayChannel,
  getConversationDisplayDetail,
  getConversationDisplayName,
} from '../../lib/conversation-display';
import { useEscapeKey } from '../../lib/useEscapeKey';
import defaultProfilePictureUrl from '../../assets/profile.png';
import FeedbackPopupStack from '../../components/FeedbackPopupStack';
import CsvImportModal from '../../components/CsvImportModal';
import { DropdownSelect } from '../../components/ui/DropdownSelect';
import {
  getConversationThreadStatusClassName,
  LEAD_STATUS_OPTIONS,
  normalizeConversationThreadStatus,
} from '../../lib/lead-status';
import type { ConversationThread, WorkspaceTeamMember } from '../../lib/types';

const CONTACTS_SAMPLE_CSV = [
  'name,phone,owner,status,priority,labels,whatsappMarketing,email,source,remark',
].join('\r\n');

const STATUS_OPTIONS: ConversationThread['status'][] = [...LEAD_STATUS_OPTIONS];
const PRIORITY_OPTIONS: ConversationThread['priority'][] = ['Low', 'Medium', 'High'];

interface ContactFormState {
  contactName: string;
  countryOptionId: string;
  contactNumber: string;
  ownerName: string;
  email: string;
  source: string;
  remark: string;
  status: ConversationThread['status'];
  priority: ConversationThread['priority'];
  labels: string;
  marketingOptedOut: boolean;
}

type ContactSortOption = 'name-asc' | 'created-desc' | 'updated-desc';
type ContactChannelFilter = 'all' | 'whatsapp' | 'instagram' | 'messenger';
type ContactMarketingFilter = 'all' | 'opted-in' | 'opted-out';
type ContactAttributeFilter = 'all' | 'has-attributes' | 'no-attributes';

interface ContactFilterState {
  status: 'all' | ConversationThread['status'];
  priority: 'all' | ConversationThread['priority'];
  ownerName: string;
  source: string;
  label: string;
  channel: ContactChannelFilter;
  marketing: ContactMarketingFilter;
  attributePresence: ContactAttributeFilter;
  dateField: 'createdAt' | 'updatedAt';
  dateFrom: string;
  dateTo: string;
}

function buildDefaultContactFilters(): ContactFilterState {
  return {
    status: 'all',
    priority: 'all',
    ownerName: '',
    source: '',
    label: '',
    channel: 'all',
    marketing: 'all',
    attributePresence: 'all',
    dateField: 'createdAt',
    dateFrom: '',
    dateTo: '',
  };
}

function getContactDateTimestamp(value: string | null | undefined) {
  const timestamp = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function labelsToString(labels: string[]) {
  return labels.join(', ');
}

function parseLabels(value: string) {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((label) => label.trim())
        .filter(Boolean),
    ),
  );
}

function buildForm(contact: ConversationThread | null, defaultOwner: string, preferredCountryCode?: string | null) {
  const phoneFields = splitPhoneForForm(
    contact?.displayPhone || formatContactIdentity(contact?.contactWaId) || '',
    preferredCountryCode,
  );

  return {
    contactName: contact?.contactName || '',
    countryOptionId: phoneFields.countryOptionId,
    contactNumber: phoneFields.contactNumber,
    ownerName: contact?.ownerName || defaultOwner,
    email: contact?.email || '',
    source: contact?.source || '',
    remark: contact?.remark || '',
    status: contact?.status || 'New Lead',
    priority: contact?.priority || 'Medium',
    labels: labelsToString(contact?.labels || []),
    marketingOptedOut: Boolean(contact?.marketingOptedOut),
  } satisfies ContactFormState;
}

function getContactName(contact: ConversationThread) {
  return getConversationDisplayName(contact);
}

function getContactPhone(contact: ConversationThread) {
  if (getConversationDisplayChannel(contact) !== 'whatsapp') {
    return contact.username || getConversationDisplayDetail(contact) || '';
  }

  return getConversationDisplayDetail(contact) || contact.displayPhone || formatContactIdentity(contact.contactWaId) || contact.contactWaId || '';
}

function getContactIdentifierLabel(contact: ConversationThread) {
  if (getConversationDisplayChannel(contact) === 'instagram') {
    return `Instagram: ${contact.username || getConversationDisplayName(contact)}`;
  }

  if (getConversationDisplayChannel(contact) === 'messenger') {
    return `Messenger: ${contact.username || getConversationDisplayName(contact)}`;
  }

  return `WA ID: ${formatContactIdentity(contact.contactWaId) || contact.contactWaId}`;
}

function getPriorityClassName(priority: ConversationThread['priority']) {
  if (priority === 'High') {
    return 'border border-red-100 bg-red-50 text-red-700';
  }

  if (priority === 'Low') {
    return 'border border-emerald-100 bg-emerald-50 text-emerald-700';
  }

  return 'border border-amber-100 bg-amber-50 text-amber-700';
}

function getStatusClassName(status: ConversationThread['status']) {
  return getConversationThreadStatusClassName(status);
}

function normalizeCsvHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function escapeCsvValue(value: string) {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
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

function normalizeImportedStatus(value: string): ConversationThread['status'] {
  return normalizeConversationThreadStatus(value);
}

function normalizeImportedPriority(value: string): ConversationThread['priority'] {
  const match =
    PRIORITY_OPTIONS.find((option) => option.toLowerCase() === value.trim().toLowerCase()) || 'Medium';

  return match;
}

function normalizeImportedMarketingOptOut(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === 'yes' || normalized === 'opted out' || normalized === 'out';
}

function buildCsvPhone(record: Record<string, string>) {
  const fullPhone = getRecordValue(record, [
    'phone',
    'fullPhone',
    'displayPhone',
    'whatsAppNumber',
    'contactWaId',
    'countryCodeContactNumber',
  ]);

  if (fullPhone) {
    return fullPhone;
  }

  const countryCode = getRecordValue(record, ['countryCode']);
  const contactNumber = getRecordValue(record, ['contactNumber', 'number', 'phoneNumber']);

  if (!countryCode && !contactNumber) {
    return '';
  }

  return `${countryCode}${contactNumber}`;
}

function buildContactsCsv(contacts: ConversationThread[]) {
  const headers = [
    'name',
    'phone',
    'owner',
    'status',
    'priority',
    'labels',
    'whatsappMarketing',
    'email',
    'source',
    'remark',
    'threadId',
    'waId',
  ];

  const lines = contacts.map((contact) =>
    [
      getContactName(contact),
      getContactPhone(contact),
      contact.ownerName || '',
      contact.status,
      contact.priority,
      contact.labels.join('|'),
      contact.marketingOptedOut ? 'Opted Out' : 'Opted In',
      contact.email || '',
      contact.source || '',
      contact.remark || '',
      contact.id,
      contact.contactWaId,
    ]
      .map((value) => escapeCsvValue(value))
      .join(','),
  );

  return [headers.join(','), ...lines].join('\r\n');
}

function triggerFileDownload(filename: string, contents: string, type: string) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function ContactModalShell({
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEscapeKey(true, onClose);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto p-2 sm:p-4">
      <div className="flex min-h-full items-start justify-center py-2 sm:py-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 18 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 18 }}
          className="relative z-10 flex max-h-[calc(100vh-1rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl sm:max-h-[calc(100vh-2rem)]"
        >
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-100 px-4 py-4 sm:px-6 sm:py-5">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{title}</h2>
              <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-gray-200 p-2 text-gray-400 transition hover:bg-gray-50 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">{children}</div>
          {footer ? (
            <div className="flex shrink-0 gap-3 border-t border-gray-100 bg-gray-50 px-4 py-4 sm:px-6 sm:py-5">
              {footer}
            </div>
          ) : null}
        </motion.div>
      </div>
    </div>
  );
}

function ContactFormFields({
  form,
  ownerOptions,
  sourceOptions,
  onChange,
}: {
  form: ContactFormState;
  ownerOptions: SelectOption[];
  sourceOptions: SelectOption[];
  onChange: <K extends keyof ContactFormState>(field: K, value: ContactFormState[K]) => void;
}) {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">Contact Name</label>
        <input
          type="text"
          value={form.contactName}
          onChange={(event) => onChange('contactName', event.target.value)}
          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#1381FF] focus:ring-1 focus:ring-[#1381FF]"
        />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">Country Code + Contact Number</label>
        <div className="grid gap-3 sm:grid-cols-[minmax(200px,0.95fr)_minmax(0,1.05fr)]">
          <DropdownSelect
            value={form.countryOptionId}
            onChange={(nextOptionId) => onChange('countryOptionId', nextOptionId)}
            options={COUNTRY_DIAL_CODE_SELECT_OPTIONS}
            ariaLabel="Select contact country code"
            buttonClassName="rounded-xl border-gray-200 bg-gray-50 px-4 py-2.5 focus:border-[#1381FF] focus:ring-[#1381FF]/15"
          />
          <input
            type="tel"
            value={form.contactNumber}
            onChange={(event) => onChange('contactNumber', event.target.value)}
            placeholder="9876543210"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#1381FF] focus:ring-1 focus:ring-[#1381FF]"
          />
        </div>
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">Owner</label>
        <DropdownSelect
          value={form.ownerName}
          onChange={(nextOwner) => onChange('ownerName', nextOwner)}
          options={ownerOptions}
          placeholder="Select an owner"
          ariaLabel="Select contact owner"
          buttonClassName="rounded-xl border-gray-200 bg-gray-50 px-4 py-2.5 focus:border-[#1381FF] focus:ring-[#1381FF]/15"
        />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">Email</label>
        <input
          type="email"
          value={form.email}
          onChange={(event) => onChange('email', event.target.value)}
          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#1381FF] focus:ring-1 focus:ring-[#1381FF]"
        />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">Status</label>
        <DropdownSelect
          value={form.status}
          onChange={(nextStatus) => onChange('status', nextStatus as ConversationThread['status'])}
          options={STATUS_OPTIONS.map((status) => ({
            value: status,
            label: status,
          }))}
          ariaLabel="Select contact status"
          buttonClassName="rounded-xl border-gray-200 bg-gray-50 px-4 py-2.5 focus:border-[#1381FF] focus:ring-[#1381FF]/15"
        />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">Priority</label>
        <DropdownSelect
          value={form.priority}
          onChange={(nextPriority) => onChange('priority', nextPriority as ConversationThread['priority'])}
          options={PRIORITY_OPTIONS.map((priority) => ({
            value: priority,
            label: priority,
          }))}
          ariaLabel="Select contact priority"
          buttonClassName="rounded-xl border-gray-200 bg-gray-50 px-4 py-2.5 focus:border-[#1381FF] focus:ring-[#1381FF]/15"
        />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">Source</label>
        <DropdownSelect
          value={form.source}
          onChange={(nextSource) => onChange('source', nextSource)}
          options={sourceOptions}
          placeholder="Select a source"
          ariaLabel="Select contact source"
          buttonClassName="rounded-xl border-gray-200 bg-gray-50 px-4 py-2.5 focus:border-[#1381FF] focus:ring-[#1381FF]/15"
        />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">Labels</label>
        <input
          type="text"
          value={form.labels}
          onChange={(event) => onChange('labels', event.target.value)}
          placeholder="vip, support, urgent"
          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#1381FF] focus:ring-1 focus:ring-[#1381FF]"
        />
      </div>
      <label className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 md:col-span-2">
        <span>
          <span className="block text-sm font-medium text-gray-700">WhatsApp Marketing Campaigns</span>
          <span className="mt-1 block text-xs text-gray-500">
            {form.marketingOptedOut
              ? 'Opted out. Marketing template campaigns will be blocked for this contact.'
              : 'Opted in. This contact can receive WhatsApp marketing campaign templates.'}
          </span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={!form.marketingOptedOut}
          onClick={() => onChange('marketingOptedOut', !form.marketingOptedOut)}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition ${
            form.marketingOptedOut ? 'border-gray-300 bg-gray-300' : 'border-emerald-400 bg-emerald-500'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
              form.marketingOptedOut ? 'translate-x-0.5' : 'translate-x-5'
            }`}
          />
        </button>
      </label>
      <div className="md:col-span-2">
        <label className="mb-2 block text-sm font-medium text-gray-700">Remark</label>
        <textarea
          value={form.remark}
          onChange={(event) => onChange('remark', event.target.value)}
          rows={4}
          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#1381FF] focus:ring-1 focus:ring-[#1381FF]"
        />
      </div>
    </div>
  );
}

export default function Contacts() {
  const { bootstrap, refresh } = useAppData();
  const contacts = bootstrap?.conversations || [];
  const defaultOwner = bootstrap?.profile?.fullName || '';
  const preferredCountryCode = bootstrap?.profile?.countryCode || null;
  const [searchQuery, setSearchQuery] = useState('');
  const deferredQuery = useDeferredValue(searchQuery);
  const [sortOption, setSortOption] = useState<ContactSortOption>('updated-desc');
  const [filters, setFilters] = useState<ContactFilterState>(buildDefaultContactFilters);
  const [draftFilters, setDraftFilters] = useState<ContactFilterState>(buildDefaultContactFilters);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<ContactFormState>(() => buildForm(null, defaultOwner, preferredCountryCode));
  const [viewContactId, setViewContactId] = useState<string | null>(null);
  const [editContactId, setEditContactId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ContactFormState>(() => buildForm(null, defaultOwner, preferredCountryCode));
  const [deleteContactId, setDeleteContactId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isCsvImportOpen, setIsCsvImportOpen] = useState(false);
  const [teamMembers, setTeamMembers] = useState<WorkspaceTeamMember[]>([]);

  useEffect(() => {
    let isMounted = true;

    const loadTeamMembers = async () => {
      try {
        const response = await appApi.getTeamMembers();

        if (isMounted) {
          setTeamMembers(response.members);
        }
      } catch {
        if (isMounted) {
          setTeamMembers([]);
        }
      }
    };

    void loadTeamMembers();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredContacts = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();
    const rangeStart = filters.dateFrom
      ? new Date(`${filters.dateFrom}T00:00:00`).getTime()
      : null;
    const rangeEnd = filters.dateTo
      ? new Date(`${filters.dateTo}T23:59:59.999`).getTime()
      : null;

    const matchingContacts = contacts.filter((contact) => {
      if (normalizedQuery) {
        const haystack = [
          contact.contactName,
          contact.username,
          contact.displayPhone,
          contact.contactWaId,
          contact.ownerName,
          contact.email,
          contact.source,
          contact.remark,
          contact.labels.join(' '),
          contact.marketingOptedOut ? 'marketing opted out whatsapp opt out' : 'marketing opted in whatsapp opt in',
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (!haystack.includes(normalizedQuery)) {
          return false;
        }
      }

      if (filters.status !== 'all' && contact.status !== filters.status) {
        return false;
      }

      if (filters.priority !== 'all' && contact.priority !== filters.priority) {
        return false;
      }

      if (filters.ownerName && contact.ownerName !== filters.ownerName) {
        return false;
      }

      if (filters.source && contact.source !== filters.source) {
        return false;
      }

      if (filters.label && !contact.labels.includes(filters.label)) {
        return false;
      }

      if (filters.channel !== 'all' && getConversationDisplayChannel(contact) !== filters.channel) {
        return false;
      }

      if (filters.marketing === 'opted-in' && contact.marketingOptedOut) {
        return false;
      }

      if (filters.marketing === 'opted-out' && !contact.marketingOptedOut) {
        return false;
      }

      const hasCustomAttributes = Object.keys(contact.attributes || {}).length > 0;
      if (filters.attributePresence === 'has-attributes' && !hasCustomAttributes) {
        return false;
      }

      if (filters.attributePresence === 'no-attributes' && hasCustomAttributes) {
        return false;
      }

      if (rangeStart !== null || rangeEnd !== null) {
        const contactTimestamp = getContactDateTimestamp(contact[filters.dateField]);

        if (!contactTimestamp) {
          return false;
        }

        if (rangeStart !== null && contactTimestamp < rangeStart) {
          return false;
        }

        if (rangeEnd !== null && contactTimestamp > rangeEnd) {
          return false;
        }
      }

      return true;
    });

    return [...matchingContacts].sort((left, right) => {
      if (sortOption === 'name-asc') {
        return getContactName(left).localeCompare(getContactName(right), undefined, {
          sensitivity: 'base',
        });
      }

      const dateField = sortOption === 'created-desc' ? 'createdAt' : 'updatedAt';
      const dateDifference =
        getContactDateTimestamp(right[dateField]) - getContactDateTimestamp(left[dateField]);

      return dateDifference || getContactName(left).localeCompare(getContactName(right));
    });
  }, [contacts, deferredQuery, filters, sortOption]);

  const filterOwnerOptions = useMemo(
    () =>
      Array.from(
        new Set<string>(
          contacts.flatMap((contact) => {
            const ownerName = contact.ownerName?.trim();
            return ownerName ? [ownerName] : [];
          }),
        ),
      ).sort((left, right) => left.localeCompare(right)),
    [contacts],
  );
  const filterSourceOptions = useMemo(
    () =>
      Array.from(
        new Set<string>(
          contacts.flatMap((contact) => {
            const source = contact.source?.trim();
            return source ? [source] : [];
          }),
        ),
      ).sort((left, right) => left.localeCompare(right)),
    [contacts],
  );
  const filterLabelOptions = useMemo(
    () =>
      Array.from(new Set<string>(contacts.flatMap((contact) => contact.labels))).sort((left, right) =>
        left.localeCompare(right),
      ),
    [contacts],
  );
  const activeFilterCount = useMemo(() => {
    let count = 0;

    if (filters.status !== 'all') count += 1;
    if (filters.priority !== 'all') count += 1;
    if (filters.ownerName) count += 1;
    if (filters.source) count += 1;
    if (filters.label) count += 1;
    if (filters.channel !== 'all') count += 1;
    if (filters.marketing !== 'all') count += 1;
    if (filters.attributePresence !== 'all') count += 1;
    if (filters.dateFrom || filters.dateTo) count += 1;

    return count;
  }, [filters]);

  const viewContact = contacts.find((contact) => contact.id === viewContactId) || null;
  const editContact = contacts.find((contact) => contact.id === editContactId) || null;
  const deleteContact = contacts.find((contact) => contact.id === deleteContactId) || null;
  const createOwnerOptions = useMemo(
    () => buildOwnerOptions(teamMembers, [defaultOwner, createForm.ownerName]),
    [createForm.ownerName, defaultOwner, teamMembers],
  );
  const editOwnerOptions = useMemo(
    () => buildOwnerOptions(teamMembers, [defaultOwner, editForm.ownerName]),
    [defaultOwner, editForm.ownerName, teamMembers],
  );
  const createSourceOptions = useMemo(() => buildSourceOptions([createForm.source]), [createForm.source]);
  const editSourceOptions = useMemo(() => buildSourceOptions([editForm.source]), [editForm.source]);
  const createPhoneValue = useMemo(
    () => buildPhoneFromForm(createForm.countryOptionId, createForm.contactNumber),
    [createForm.contactNumber, createForm.countryOptionId],
  );
  const editPhoneValue = useMemo(
    () => buildPhoneFromForm(editForm.countryOptionId, editForm.contactNumber),
    [editForm.contactNumber, editForm.countryOptionId],
  );

  const updateCreateForm = <K extends keyof ContactFormState>(field: K, value: ContactFormState[K]) => {
    setCreateForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const updateEditForm = <K extends keyof ContactFormState>(field: K, value: ContactFormState[K]) => {
    setEditForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const resetMessages = () => {
    setError(null);
    setNotice(null);
  };

  const updateDraftFilter = <K extends keyof ContactFilterState>(
    field: K,
    value: ContactFilterState[K],
  ) => {
    setDraftFilters((current) => ({ ...current, [field]: value }));
    setFilterError(null);
  };

  const openFilterModal = () => {
    setDraftFilters(filters);
    setFilterError(null);
    setIsFilterOpen(true);
  };

  const closeFilterModal = () => {
    setFilterError(null);
    setIsFilterOpen(false);
  };

  const applyContactFilters = () => {
    if (draftFilters.dateFrom && draftFilters.dateTo && draftFilters.dateFrom > draftFilters.dateTo) {
      setFilterError('The start date must be before the end date.');
      return;
    }

    setFilters(draftFilters);
    setFilterError(null);
    setIsFilterOpen(false);
  };

  const clearContactFilters = () => {
    const nextFilters = buildDefaultContactFilters();
    setFilters(nextFilters);
    setDraftFilters(nextFilters);
    setFilterError(null);
  };

  const openCreateModal = () => {
    resetMessages();
    setCreateForm(buildForm(null, defaultOwner, preferredCountryCode));
    setIsCreateOpen(true);
  };

  const openEditModal = (contact: ConversationThread) => {
    resetMessages();
    setEditContactId(contact.id);
    setEditForm(buildForm(contact, defaultOwner, preferredCountryCode));
  };

  const handleCreateContact = async (event: FormEvent) => {
    event.preventDefault();

    if (!createPhoneValue.trim()) {
      setError('A country code and contact number are required.');
      return;
    }

    try {
      setIsSaving(true);
      resetMessages();
      await appApi.createContact({
        contactWaId: createPhoneValue,
        contactName: createForm.contactName,
        displayPhone: createPhoneValue,
        ownerName: createForm.ownerName,
        email: createForm.email,
        source: createForm.source || 'Not Available',
        remark: createForm.remark,
        labels: parseLabels(createForm.labels),
        marketingOptedOut: createForm.marketingOptedOut,
        status: createForm.status,
        priority: createForm.priority,
      });
      setIsCreateOpen(false);
      await refresh();
      setNotice('Contact saved.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to save contact.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveEdit = async (event: FormEvent) => {
    event.preventDefault();

    if (!editContact) {
      return;
    }

    if (!editPhoneValue.trim()) {
      setError('A country code and contact number are required.');
      return;
    }

    try {
      setIsSaving(true);
      resetMessages();
      await appApi.updateContact(editContact.id, {
        contactName: editForm.contactName,
        displayPhone: editPhoneValue,
        ownerName: editForm.ownerName,
        email: editForm.email,
        source: editForm.source || 'Not Available',
        remark: editForm.remark,
        status: editForm.status,
        priority: editForm.priority,
        labels: parseLabels(editForm.labels),
        marketingOptedOut: editForm.marketingOptedOut,
      });
      setEditContactId(null);
      await refresh();
      setNotice('Contact updated.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to update contact.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteContact = async () => {
    if (!deleteContact) {
      return;
    }

    try {
      setIsDeleting(true);
      resetMessages();
      await appApi.deleteContact(deleteContact.id);
      setDeleteContactId(null);
      await refresh();
      setNotice('Contact deleted.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to delete contact.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExportCsv = () => {
    const exportableContacts = filteredContacts;

    if (exportableContacts.length === 0) {
      setError('There are no contacts to export.');
      setNotice(null);
      return;
    }

    const csv = buildContactsCsv(exportableContacts);
    const filename = `contacts-${new Date().toISOString().slice(0, 10)}.csv`;
    triggerFileDownload(filename, csv, 'text/csv;charset=utf-8');
    setNotice(`Exported ${exportableContacts.length} contact${exportableContacts.length === 1 ? '' : 's'} to CSV.`);
    setError(null);
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];

    if (!file) {
      return;
    }

    try {
      setIsImporting(true);
      resetMessages();
      const text = await file.text();
      const records = parseCsvRecords(text);

      if (records.length === 0) {
        throw new Error('The CSV file is empty or missing data rows.');
      }

      let importedCount = 0;
      let skippedCount = 0;

      for (const record of records) {
        const displayPhone = buildCsvPhone(record);

        if (!displayPhone) {
          skippedCount += 1;
          continue;
        }

        await appApi.createContact({
          contactWaId: displayPhone,
          displayPhone,
          contactName: getRecordValue(record, ['name', 'contactName']),
          ownerName: getRecordValue(record, ['owner', 'ownerName']) || defaultOwner,
          email: getRecordValue(record, ['email']),
          source: getRecordValue(record, ['source']) || 'CSV Import',
          remark: getRecordValue(record, ['remark', 'notes']),
          labels: parseLabels(getRecordValue(record, ['labels'])),
          marketingOptedOut: normalizeImportedMarketingOptOut(
            getRecordValue(record, ['whatsappMarketing', 'marketingOptedOut', 'marketingOptOut', 'optOut']),
          ),
          status: normalizeImportedStatus(getRecordValue(record, ['status'])),
          priority: normalizeImportedPriority(getRecordValue(record, ['priority'])),
        });
        importedCount += 1;
      }

      await refresh();

      if (importedCount === 0) {
        throw new Error('No valid contacts were found in the CSV file.');
      }

      setNotice(
        skippedCount > 0
          ? `Imported ${importedCount} contacts. Skipped ${skippedCount} rows without a valid phone number.`
          : `Imported ${importedCount} contacts from CSV.`,
      );
      setIsCsvImportOpen(false);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to import contacts from CSV.');
    } finally {
      setIsImporting(false);
      event.currentTarget.value = '';
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Contacts <span className="font-semibold text-gray-400">({contacts.length.toLocaleString()})</span>
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Search, filter, import, export, and manage your contact list.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1381FF] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#1381FF]/20 transition hover:-translate-y-px hover:bg-[#4a35e8]"
        >
          <CirclePlus className="h-4 w-4" />
          Add New Contact
        </button>
      </div>

      <div className="space-y-4 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by name, phone, owner, label, source, or remark"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-[#1381FF] focus:ring-1 focus:ring-[#1381FF]"
            />
          </div>

          <DropdownSelect
            value={sortOption}
            onChange={(nextSortOption) => setSortOption(nextSortOption as ContactSortOption)}
            options={[
              { value: 'name-asc', label: 'Name A–Z' },
              { value: 'created-desc', label: 'Date Created' },
              { value: 'updated-desc', label: 'Last Updated' },
            ]}
            ariaLabel="Sort contacts"
            className="w-full lg:w-52"
            buttonClassName="rounded-xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#1381FF] focus:ring-[#1381FF]/15"
            menuClassName="right-0"
          />

          <button
            type="button"
            onClick={openFilterModal}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition ${
              activeFilterCount > 0
                ? 'border-blue-200 bg-blue-50 text-[#2364ff] hover:bg-blue-100'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Filter className="h-4 w-4" />
            Filters
            {activeFilterCount > 0 ? (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#2364ff] px-1.5 text-[11px] font-bold text-white">
                {activeFilterCount}
              </span>
            ) : null}
          </button>
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
            <span>
              Showing <strong className="font-semibold text-gray-900">{filteredContacts.length.toLocaleString()}</strong> of{' '}
              <strong className="font-semibold text-gray-900">{contacts.length.toLocaleString()}</strong> contacts
            </span>
            {activeFilterCount > 0 ? (
              <button
                type="button"
                onClick={clearContactFilters}
                className="font-semibold text-[#2364ff] transition hover:text-[#1d54d9]"
              >
                Clear filters
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2 sm:justify-end">
            <button
              type="button"
              onClick={() => setIsCsvImportOpen(true)}
              disabled={isImporting}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:border-gray-300 hover:bg-gray-50 disabled:opacity-60"
            >
              {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
              Import CSV
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isFilterOpen ? (
          <ContactModalShell
            title="Filter Contacts"
            subtitle="Narrow the contact list using attributes, ownership, channel, and date range."
            onClose={closeFilterModal}
            footer={
              <>
                <button
                  type="button"
                  onClick={() => {
                    setDraftFilters(buildDefaultContactFilters());
                    setFilterError(null);
                  }}
                  className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={closeFilterModal}
                  className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={applyContactFilters}
                  className="flex-1 rounded-xl bg-[#1381FF] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#4a35e8]"
                >
                  Apply Filters
                </button>
              </>
            }
          >
            <div className="space-y-6">
              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Status</label>
                  <DropdownSelect
                    value={draftFilters.status}
                    onChange={(value) => updateDraftFilter('status', value as ContactFilterState['status'])}
                    options={[
                      { value: 'all', label: 'All statuses' },
                      ...STATUS_OPTIONS.map((status) => ({ value: status, label: status })),
                    ]}
                    ariaLabel="Filter contacts by status"
                    buttonClassName="rounded-xl border-gray-200 bg-gray-50 px-4 py-2.5 focus:border-[#1381FF] focus:ring-[#1381FF]/15"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Priority</label>
                  <DropdownSelect
                    value={draftFilters.priority}
                    onChange={(value) => updateDraftFilter('priority', value as ContactFilterState['priority'])}
                    options={[
                      { value: 'all', label: 'All priorities' },
                      ...PRIORITY_OPTIONS.map((priority) => ({ value: priority, label: priority })),
                    ]}
                    ariaLabel="Filter contacts by priority"
                    buttonClassName="rounded-xl border-gray-200 bg-gray-50 px-4 py-2.5 focus:border-[#1381FF] focus:ring-[#1381FF]/15"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Owner</label>
                  <DropdownSelect
                    value={draftFilters.ownerName}
                    onChange={(value) => updateDraftFilter('ownerName', value)}
                    options={[
                      { value: '', label: 'All owners' },
                      ...filterOwnerOptions.map((ownerName) => ({ value: ownerName, label: ownerName })),
                    ]}
                    ariaLabel="Filter contacts by owner"
                    buttonClassName="rounded-xl border-gray-200 bg-gray-50 px-4 py-2.5 focus:border-[#1381FF] focus:ring-[#1381FF]/15"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Source</label>
                  <DropdownSelect
                    value={draftFilters.source}
                    onChange={(value) => updateDraftFilter('source', value)}
                    options={[
                      { value: '', label: 'All sources' },
                      ...filterSourceOptions.map((source) => ({ value: source, label: source })),
                    ]}
                    ariaLabel="Filter contacts by source"
                    buttonClassName="rounded-xl border-gray-200 bg-gray-50 px-4 py-2.5 focus:border-[#1381FF] focus:ring-[#1381FF]/15"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Label</label>
                  <DropdownSelect
                    value={draftFilters.label}
                    onChange={(value) => updateDraftFilter('label', value)}
                    options={[
                      { value: '', label: 'All labels' },
                      ...filterLabelOptions.map((label) => ({ value: label, label })),
                    ]}
                    ariaLabel="Filter contacts by label"
                    buttonClassName="rounded-xl border-gray-200 bg-gray-50 px-4 py-2.5 focus:border-[#1381FF] focus:ring-[#1381FF]/15"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Channel</label>
                  <DropdownSelect
                    value={draftFilters.channel}
                    onChange={(value) => updateDraftFilter('channel', value as ContactChannelFilter)}
                    options={[
                      { value: 'all', label: 'All channels' },
                      { value: 'whatsapp', label: 'WhatsApp' },
                      { value: 'instagram', label: 'Instagram' },
                      { value: 'messenger', label: 'Messenger' },
                    ]}
                    ariaLabel="Filter contacts by channel"
                    buttonClassName="rounded-xl border-gray-200 bg-gray-50 px-4 py-2.5 focus:border-[#1381FF] focus:ring-[#1381FF]/15"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">WhatsApp Marketing</label>
                  <DropdownSelect
                    value={draftFilters.marketing}
                    onChange={(value) => updateDraftFilter('marketing', value as ContactMarketingFilter)}
                    options={[
                      { value: 'all', label: 'Any preference' },
                      { value: 'opted-in', label: 'Opted in' },
                      { value: 'opted-out', label: 'Opted out' },
                    ]}
                    ariaLabel="Filter contacts by marketing preference"
                    buttonClassName="rounded-xl border-gray-200 bg-gray-50 px-4 py-2.5 focus:border-[#1381FF] focus:ring-[#1381FF]/15"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Custom Attributes</label>
                  <DropdownSelect
                    value={draftFilters.attributePresence}
                    onChange={(value) => updateDraftFilter('attributePresence', value as ContactAttributeFilter)}
                    options={[
                      { value: 'all', label: 'Any attributes' },
                      { value: 'has-attributes', label: 'Has custom attributes' },
                      { value: 'no-attributes', label: 'No custom attributes' },
                    ]}
                    ariaLabel="Filter contacts by custom attributes"
                    buttonClassName="rounded-xl border-gray-200 bg-gray-50 px-4 py-2.5 focus:border-[#1381FF] focus:ring-[#1381FF]/15"
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Date Attribute</label>
                    <DropdownSelect
                      value={draftFilters.dateField}
                      onChange={(value) => updateDraftFilter('dateField', value as ContactFilterState['dateField'])}
                      options={[
                        { value: 'createdAt', label: 'Date Created' },
                        { value: 'updatedAt', label: 'Last Updated' },
                      ]}
                      ariaLabel="Select contact date attribute"
                      buttonClassName="rounded-xl border-gray-200 bg-white px-4 py-2.5 focus:border-[#1381FF] focus:ring-[#1381FF]/15"
                    />
                  </div>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-gray-700">From</span>
                    <input
                      type="date"
                      value={draftFilters.dateFrom}
                      max={draftFilters.dateTo || undefined}
                      onChange={(event) => updateDraftFilter('dateFrom', event.target.value)}
                      className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-700 outline-none transition focus:border-[#1381FF] focus:ring-1 focus:ring-[#1381FF]"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-gray-700">To</span>
                    <input
                      type="date"
                      value={draftFilters.dateTo}
                      min={draftFilters.dateFrom || undefined}
                      onChange={(event) => updateDraftFilter('dateTo', event.target.value)}
                      className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-700 outline-none transition focus:border-[#1381FF] focus:ring-1 focus:ring-[#1381FF]"
                    />
                  </label>
                </div>
              </div>

              {filterError ? (
                <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {filterError}
                </div>
              ) : null}
            </div>
          </ContactModalShell>
        ) : null}
      </AnimatePresence>

      {isCsvImportOpen ? (
        <CsvImportModal
          title="Import Contacts CSV"
          description="Upload a CSV using the required headers below. Download the blank sample CSV first if you need the correct structure."
          sampleFilename="contacts-sample.csv"
          sampleCsv={CONTACTS_SAMPLE_CSV}
          isImporting={isImporting}
          onClose={() => setIsCsvImportOpen(false)}
          onImport={handleImportFile}
        />
      ) : null}

      <FeedbackPopupStack
        items={[
          ...(error ? [{ id: 'contacts-error', tone: 'error' as const, message: error, onDismiss: () => setError(null) }] : []),
          ...(notice ? [{ id: 'contacts-notice', tone: 'success' as const, message: notice, onDismiss: () => setNotice(null) }] : []),
        ]}
      />

      <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                  Name
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                  Country Code + Contact Number
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                  Attributes
                </th>
                <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                  View
                </th>
                <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                  Edit
                </th>
                <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                  Delete
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredContacts.map((contact) => (
                <tr key={contact.id} className="hover:bg-gray-50/80">
                  <td className="px-6 py-4 align-top">
                    <div className="flex items-start gap-3">
                      <img
                        src={contact.avatarUrl || defaultProfilePictureUrl}
                        alt={`${getContactName(contact)} profile`}
                        className="h-10 w-10 shrink-0 rounded-2xl object-cover"
                        referrerPolicy="no-referrer"
                        onError={(event) => {
                          event.currentTarget.src = defaultProfilePictureUrl;
                        }}
                        draggable={false}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900">{getContactName(contact)}</p>
                        <p className="mt-1 truncate text-xs text-gray-500">
                          {contact.email || contact.source || 'No additional details'}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 align-top">
                    <p className="text-sm font-medium text-gray-900">{getContactPhone(contact) || 'Not available'}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {getContactIdentifierLabel(contact)}
                    </p>
                  </td>
                  <td className="px-6 py-4 align-top">
                    <div className="flex flex-wrap gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${getStatusClassName(contact.status)}`}>
                        {contact.status}
                      </span>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${getPriorityClassName(contact.priority)}`}>
                        {contact.priority}
                      </span>
                      {contact.labels.slice(0, 2).map((label) => (
                        <span
                          key={label}
                          className="rounded-full border border-violet-100 bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-700"
                        >
                          {label}
                        </span>
                      ))}
                      {contact.labels.length > 2 ? (
                        <span className="rounded-full border border-gray-200 bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-600">
                          +{contact.labels.length - 2} more
                        </span>
                      ) : null}
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                          contact.marketingOptedOut
                            ? 'border-rose-100 bg-rose-50 text-rose-700'
                            : 'border-emerald-100 bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {contact.marketingOptedOut ? 'Marketing opted out' : 'Marketing opted in'}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-gray-500">Owner: {contact.ownerName || 'Unassigned'}</p>
                  </td>
                  <td className="px-4 py-4 text-center align-top">
                    <button
                      type="button"
                      onClick={() => setViewContactId(contact.id)}
                      className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      View
                    </button>
                  </td>
                  <td className="px-4 py-4 text-center align-top">
                    <button
                      type="button"
                      onClick={() => openEditModal(contact)}
                      className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </button>
                  </td>
                  <td className="px-4 py-4 text-center align-top">
                    <button
                      type="button"
                      onClick={() => {
                        resetMessages();
                        setDeleteContactId(contact.id);
                      }}
                      className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 transition hover:bg-red-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </td>
                </tr>
              ))}

              {filteredContacts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <div className="mx-auto flex max-w-sm flex-col items-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
                        <User className="h-6 w-6" />
                      </div>
                      <p className="mt-4 text-sm font-semibold text-gray-900">No contacts found</p>
                      <p className="mt-2 text-sm text-gray-500">
                        Try a different search term, import a CSV, or add a new contact manually.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {isCreateOpen ? (
          <ContactModalShell
            title="Add New Contact"
            subtitle="Create a contact manually or add one before starting a conversation."
            onClose={() => setIsCreateOpen(false)}
            footer={
              <>
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="create-contact-form"
                  disabled={isSaving || !createPhoneValue.trim()}
                  className="flex-1 rounded-xl bg-[#1381FF] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#4a35e8] disabled:opacity-60"
                >
                  {isSaving ? 'Saving...' : 'Save Contact'}
                </button>
              </>
            }
          >
            <form id="create-contact-form" onSubmit={handleCreateContact}>
              <ContactFormFields
                form={createForm}
                ownerOptions={createOwnerOptions}
                sourceOptions={createSourceOptions}
                onChange={updateCreateForm}
              />
            </form>
          </ContactModalShell>
        ) : null}

        {viewContact ? (
          <ContactModalShell
            title="View Contact"
            subtitle="A compact view of the selected contact record."
            onClose={() => setViewContactId(null)}
            footer={
              <button
                type="button"
                onClick={() => setViewContactId(null)}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                Close
              </button>
            }
          >
            <div className="grid gap-5 md:grid-cols-2">
              {[
                { label: 'Name', value: getContactName(viewContact) },
                { label: 'Country Code + Contact Number', value: getContactPhone(viewContact) || 'Not available' },
                { label: 'Owner', value: viewContact.ownerName || 'Unassigned' },
                { label: 'Email', value: viewContact.email || 'Not available' },
                { label: 'Status', value: viewContact.status },
                { label: 'Priority', value: viewContact.priority },
                {
                  label: 'WhatsApp Marketing',
                  value: viewContact.marketingOptedOut ? 'Opted Out' : 'Opted In',
                },
                { label: 'Source', value: viewContact.source || 'Not available' },
                { label: 'Identifier', value: viewContact.id },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">{item.label}</p>
                  <p className="mt-2 text-sm font-medium text-gray-900 break-words">{item.value}</p>
                </div>
              ))}

              <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 md:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Labels</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {viewContact.labels.length > 0 ? (
                    viewContact.labels.map((label) => (
                      <span
                        key={label}
                        className="rounded-full border border-violet-100 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700"
                      >
                        {label}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-gray-500">No labels assigned</span>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 md:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Remark</p>
                <p className="mt-2 text-sm text-gray-700">
                  {viewContact.remark || 'No remark added for this contact.'}
                </p>
              </div>
            </div>
          </ContactModalShell>
        ) : null}

        {editContact ? (
          <ContactModalShell
            title="Edit Contact"
            subtitle="Update the contact details shown in your workspace."
            onClose={() => setEditContactId(null)}
            footer={
              <>
                <button
                  type="button"
                  onClick={() => setEditContactId(null)}
                  className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="edit-contact-form"
                  disabled={isSaving || !editPhoneValue.trim()}
                  className="flex-1 rounded-xl bg-[#1381FF] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#4a35e8] disabled:opacity-60"
                >
                  {isSaving ? 'Saving...' : 'Update Contact'}
                </button>
              </>
            }
          >
            <form id="edit-contact-form" onSubmit={handleSaveEdit}>
              <ContactFormFields
                form={editForm}
                ownerOptions={editOwnerOptions}
                sourceOptions={editSourceOptions}
                onChange={updateEditForm}
              />
            </form>
          </ContactModalShell>
        ) : null}

        {deleteContact ? (
          <ContactModalShell
            title="Delete Contact"
            subtitle="This removes the contact record from your workspace."
            onClose={() => setDeleteContactId(null)}
            footer={
              <>
                <button
                  type="button"
                  onClick={() => setDeleteContactId(null)}
                  className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteContact()}
                  disabled={isDeleting}
                  className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-60"
                >
                  {isDeleting ? 'Deleting...' : 'Delete Contact'}
                </button>
              </>
            }
          >
            <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-4 text-sm text-red-800">
              <p className="font-semibold text-red-900">{getContactName(deleteContact)}</p>
              <p className="mt-2">
                This action will remove the contact row and its linked conversation record from the workspace.
              </p>
            </div>
          </ContactModalShell>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
