import { useDeferredValue, useEffect, useMemo, useState, type ChangeEvent, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { CalendarDays, Download, FileSpreadsheet, History, Loader2, Pencil, Plus, Save, Search, UserPlus, X } from 'lucide-react';
import { appApi } from '../../lib/api';
import { useAppData } from '../../context/AppDataContext';
import { upsertConversationThread } from '../../lib/conversations';
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
import { formatContactIdentity } from '../../lib/phone';
import { useEscapeKey } from '../../lib/useEscapeKey';
import defaultProfilePictureUrl from '../../assets/profile.png';
import { DropdownSelect } from '../../components/ui/DropdownSelect';
import CsvImportModal from '../../components/CsvImportModal';
import {
  getConversationThreadStatusClassName,
  LEAD_STATUS_OPTIONS,
  normalizeConversationThreadStatus,
} from '../../lib/lead-status';
import type { ConversationMessage, ConversationThread, WorkspaceTeamMember } from '../../lib/types';

const STAGE_OPTIONS: Array<'all' | ConversationThread['status']> = ['all', ...LEAD_STATUS_OPTIONS];
const LEADS_SAMPLE_CSV = [
  'Name,Phone Number,Email,Lead Owner,Source,Lead Status,Remark',
].join('\r\n');

interface LeadFormState {
  contactName: string;
  countryOptionId: string;
  contactNumber: string;
  email: string;
  ownerName: string;
  source: string;
  status: ConversationThread['status'];
  remark: string;
}

interface UpdateFormState {
  ownerName: string;
  source: string;
  status: ConversationThread['status'];
  remark: string;
}

function getLeadName(thread: ConversationThread) {
  return getConversationDisplayName(thread);
}

function getLeadPhone(thread: ConversationThread) {
  return getConversationDisplayDetail(thread) || thread.displayPhone || formatContactIdentity(thread.contactWaId) || thread.contactWaId;
}

function getLeadIdentifierLabel(thread: ConversationThread) {
  if (getConversationDisplayChannel(thread) === 'messenger') {
    return `Messenger PSID: ${thread.displayPhone || thread.contactWaId}`;
  }

  return `WA ID: ${formatContactIdentity(thread.contactWaId) || thread.contactWaId}`;
}

function getLeadSource(thread: ConversationThread) {
  if (thread.source?.trim()) return thread.source.trim();
  if (thread.labels.some((label) => label.toLowerCase() === 'meta lead')) return 'Meta Ads';
  return '';
}

function getLeadRemark(thread: ConversationThread) {
  return thread.remark?.trim() || '';
}

function normalizeStage(value: string | null | undefined): ConversationThread['status'] {
  return normalizeConversationThreadStatus(value);
}

function formatDateTime(value: string | null) {
  if (!value) return 'Not available';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString();
}

function getTimestamp(value: string | null) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getStageClassName(status: ConversationThread['status']) {
  return getConversationThreadStatusClassName(status);
}

function buildLeadForm(
  lead: ConversationThread | null,
  defaultOwner: string,
  preferredCountryCode?: string | null,
): LeadFormState {
  const phoneFields = splitPhoneForForm(lead ? getLeadPhone(lead) : '', preferredCountryCode);

  return {
    contactName: lead?.contactName || '',
    countryOptionId: phoneFields.countryOptionId,
    contactNumber: phoneFields.contactNumber,
    email: lead?.email || '',
    ownerName: lead?.ownerName || defaultOwner,
    source: lead ? getLeadSource(lead) : '',
    status: lead?.status || 'New Lead',
    remark: lead ? getLeadRemark(lead) : '',
  };
}

function buildUpdateForm(lead: ConversationThread | null, defaultOwner: string): UpdateFormState {
  return {
    ownerName: lead?.ownerName || defaultOwner,
    source: lead ? getLeadSource(lead) : '',
    status: lead?.status || 'New Lead',
    remark: lead ? getLeadRemark(lead) : '',
  };
}

function normalizeCsvHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function escapeCsvCell(value: string) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let insideQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"') {
      if (insideQuotes && next === '"') {
        value += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }
    if (char === ',' && !insideQuotes) {
      row.push(value.trim());
      value = '';
      continue;
    }
    if ((char === '\n' || char === '\r') && !insideQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(value.trim());
      value = '';
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      continue;
    }
    value += char;
  }
  if (value.length > 0 || row.length > 0) {
    row.push(value.trim());
    if (row.some((cell) => cell.length > 0)) rows.push(row);
  }
  return rows;
}

function ModalShell({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: ReactNode }) {
  useEscapeKey(true, onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-[28px] border border-white/40 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
            <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-700">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[calc(90vh-88px)] overflow-y-auto px-6 py-6">{children}</div>
      </div>
    </div>
  );
}

function LeadEditor({
  form,
  setForm,
  ownerOptions,
  sourceOptions,
  onClose,
  onSubmit,
  submitLabel,
  isSubmitting,
}: {
  form: LeadFormState;
  setForm: Dispatch<SetStateAction<LeadFormState>>;
  ownerOptions: SelectOption[];
  sourceOptions: SelectOption[];
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
  isSubmitting: boolean;
}) {
  return (
    <>
      <div className="grid gap-5 md:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-gray-700">Name</span>
          <input
            type="text"
            value={form.contactName}
            onChange={(event) => setForm((current) => ({ ...current, contactName: event.target.value }))}
            className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
          />
        </label>
        <div className="block">
          <span className="mb-2 block text-sm font-medium text-gray-700">Country Code + Contact Number</span>
          <div className="grid gap-3 sm:grid-cols-[minmax(210px,0.95fr)_minmax(0,1.05fr)]">
            <DropdownSelect
              value={form.countryOptionId}
              onChange={(nextOptionId) => setForm((current) => ({ ...current, countryOptionId: nextOptionId }))}
              options={COUNTRY_DIAL_CODE_SELECT_OPTIONS}
              ariaLabel="Select lead country code"
              buttonClassName="rounded-2xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#5b45ff] focus:ring-[#5b45ff]/15"
            />
            <input
              type="tel"
              value={form.contactNumber}
              onChange={(event) => setForm((current) => ({ ...current, contactNumber: event.target.value }))}
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
            />
          </div>
        </div>
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-gray-700">Email</span>
          <input
            type="email"
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
          />
        </label>
        <div className="block">
          <span className="mb-2 block text-sm font-medium text-gray-700">Lead Owner</span>
          <DropdownSelect
            value={form.ownerName}
            onChange={(nextOwner) => setForm((current) => ({ ...current, ownerName: nextOwner }))}
            options={ownerOptions}
            placeholder="Select an owner"
            ariaLabel="Select lead owner"
            buttonClassName="rounded-2xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#5b45ff] focus:ring-[#5b45ff]/15"
          />
        </div>
        <div className="block">
          <span className="mb-2 block text-sm font-medium text-gray-700">Source</span>
          <DropdownSelect
            value={form.source}
            onChange={(nextSource) => setForm((current) => ({ ...current, source: nextSource }))}
            options={sourceOptions}
            placeholder="Select a source"
            ariaLabel="Select lead source"
            buttonClassName="rounded-2xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#5b45ff] focus:ring-[#5b45ff]/15"
          />
        </div>
        <div className="block">
          <span className="mb-2 block text-sm font-medium text-gray-700">Lead Status</span>
          <DropdownSelect
            value={form.status}
            onChange={(nextStatus) => setForm((current) => ({ ...current, status: nextStatus as ConversationThread['status'] }))}
            options={STAGE_OPTIONS.filter((stage) => stage !== 'all').map((stage) => ({
              value: stage,
              label: stage,
            }))}
            ariaLabel="Select lead status"
            buttonClassName="rounded-2xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#5b45ff] focus:ring-[#5b45ff]/15"
          />
        </div>
        <label className="block md:col-span-2">
          <span className="mb-2 block text-sm font-medium text-gray-700">Remark</span>
          <textarea
            value={form.remark}
            onChange={(event) => setForm((current) => ({ ...current, remark: event.target.value }))}
            rows={4}
            className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
          />
        </label>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button type="button" onClick={onClose} className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50">Cancel</button>
        <button type="button" onClick={onSubmit} disabled={isSubmitting} className="inline-flex items-center gap-2 rounded-2xl bg-[#5b45ff] px-4 py-3 text-sm font-medium text-white shadow-lg shadow-[#5b45ff]/25 transition hover:bg-[#4a35e8] disabled:opacity-60">
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {submitLabel}
        </button>
      </div>
    </>
  );
}

export default function LeadList() {
  const { bootstrap, setBootstrap } = useAppData();
  const leads = bootstrap?.conversations || [];
  const defaultOwnerName = bootstrap?.profile?.fullName || '';
  const preferredCountryCode = bootstrap?.profile?.countryCode || null;
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<'all' | ConversationThread['status']>('all');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCsvImportOpen, setIsCsvImportOpen] = useState(false);
  const [editLeadId, setEditLeadId] = useState<string | null>(null);
  const [updateLeadId, setUpdateLeadId] = useState<string | null>(null);
  const [timelineLeadId, setTimelineLeadId] = useState<string | null>(null);
  const [leadForm, setLeadForm] = useState<LeadFormState>(() => buildLeadForm(null, defaultOwnerName, preferredCountryCode));
  const [updateForm, setUpdateForm] = useState<UpdateFormState>(() => buildUpdateForm(null, defaultOwnerName));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [timelineMessages, setTimelineMessages] = useState<ConversationMessage[]>([]);
  const [isTimelineLoading, setIsTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<WorkspaceTeamMember[]>([]);
  const deferredQuery = useDeferredValue(searchQuery);
  const editLead = leads.find((lead) => lead.id === editLeadId) || null;
  const updateLead = leads.find((lead) => lead.id === updateLeadId) || null;
  const timelineLead = leads.find((lead) => lead.id === timelineLeadId) || null;
  const leadOwnerOptions = useMemo(
    () => buildOwnerOptions(teamMembers, [defaultOwnerName, leadForm.ownerName, updateForm.ownerName]),
    [defaultOwnerName, leadForm.ownerName, teamMembers, updateForm.ownerName],
  );
  const leadSourceOptions = useMemo(
    () => buildSourceOptions([leadForm.source, updateForm.source]),
    [leadForm.source, updateForm.source],
  );
  const leadPhoneValue = useMemo(
    () => buildPhoneFromForm(leadForm.countryOptionId, leadForm.contactNumber),
    [leadForm.contactNumber, leadForm.countryOptionId],
  );

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

  useEffect(() => {
    if (isCreateModalOpen) setLeadForm(buildLeadForm(null, defaultOwnerName, preferredCountryCode));
  }, [defaultOwnerName, isCreateModalOpen, preferredCountryCode]);

  useEffect(() => {
    if (editLead) setLeadForm(buildLeadForm(editLead, defaultOwnerName, preferredCountryCode));
  }, [defaultOwnerName, editLead, preferredCountryCode]);

  useEffect(() => {
    if (updateLead) setUpdateForm(buildUpdateForm(updateLead, defaultOwnerName));
  }, [defaultOwnerName, updateLead]);

  useEffect(() => {
    if (!timelineLead) {
      setTimelineMessages([]);
      setTimelineError(null);
      setIsTimelineLoading(false);
      return;
    }
    let cancelled = false;
    const loadTimeline = async () => {
      try {
        setIsTimelineLoading(true);
        setTimelineError(null);
        const response = await appApi.getMessages(timelineLead.id, { markRead: false });
        if (cancelled) return;
        setTimelineMessages(response.messages);
        setBootstrap((current) => current ? ({ ...current, conversations: upsertConversationThread(current.conversations, response.thread) }) : current);
      } catch (error) {
        if (!cancelled) setTimelineError(error instanceof Error ? error.message : 'Failed to load the lead timeline.');
      } finally {
        if (!cancelled) setIsTimelineLoading(false);
      }
    };
    void loadTimeline();
    return () => {
      cancelled = true;
    };
  }, [setBootstrap, timelineLead]);

  const filteredLeads = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();
    return [...leads]
      .filter((lead) => {
        if (stageFilter !== 'all' && lead.status !== stageFilter) return false;
        if (!normalizedQuery) return true;
        const haystack = [
          getLeadName(lead),
          getLeadPhone(lead),
          lead.email,
          lead.ownerName,
          getLeadSource(lead),
          lead.status,
          lead.remark,
          lead.labels.join(' '),
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(normalizedQuery);
      })
      .sort((left, right) => getTimestamp(right.createdAt) - getTimestamp(left.createdAt));
  }, [deferredQuery, leads, stageFilter]);

  const stats = useMemo(() => ({
    total: leads.length,
    new: leads.filter((lead) => lead.status === 'New Lead').length,
    connected: leads.filter((lead) => lead.status === 'Connected').length,
    converted: leads.filter((lead) => lead.status === 'Converted').length,
  }), [leads]);

  const syncLead = (lead: ConversationThread) => {
    setBootstrap((current) => current ? ({ ...current, conversations: upsertConversationThread(current.conversations, lead) }) : current);
  };

  const handleCreateLead = async () => {
    if (!leadPhoneValue.trim()) {
      setFeedback({ type: 'error', message: 'A country code and contact number are required.' });
      return;
    }

    try {
      setIsSubmitting(true);
      setFeedback(null);
      const response = await appApi.createContact({
        contactWaId: leadPhoneValue,
        contactName: leadForm.contactName,
        displayPhone: leadPhoneValue,
        email: leadForm.email,
        ownerName: leadForm.ownerName,
        source: leadForm.source || 'Not Available',
        status: leadForm.status,
        remark: leadForm.remark,
        labels: leadForm.source.trim().toLowerCase() === 'meta ads' ? ['meta lead'] : [],
      });
      syncLead(response.contact);
      setIsCreateModalOpen(false);
      setFeedback({ type: 'success', message: 'Lead created successfully.' });
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Failed to create the lead.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditLead = async () => {
    if (!editLead) return;

    if (!leadPhoneValue.trim()) {
      setFeedback({ type: 'error', message: 'A country code and contact number are required.' });
      return;
    }

    try {
      setIsSubmitting(true);
      setFeedback(null);
      const response = await appApi.updateContact(editLead.id, {
        contactName: leadForm.contactName,
        displayPhone: leadPhoneValue,
        email: leadForm.email,
        ownerName: leadForm.ownerName,
        source: leadForm.source || 'Not Available',
        status: leadForm.status,
        remark: leadForm.remark,
      });
      syncLead(response.contact);
      setEditLeadId(null);
      setFeedback({ type: 'success', message: 'Lead details updated.' });
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Failed to update the lead.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickUpdate = async () => {
    if (!updateLead) return;
    try {
      setIsSubmitting(true);
      setFeedback(null);
      const response = await appApi.updateContact(updateLead.id, {
        ownerName: updateForm.ownerName,
        source: updateForm.source || 'Not Available',
        status: updateForm.status,
        remark: updateForm.remark,
      });
      syncLead(response.contact);
      setUpdateLeadId(null);
      setFeedback({ type: 'success', message: 'Lead status updated.' });
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Failed to update the lead status.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExport = () => {
    const lines = [
      ['Name', 'Phone Number', 'Email', 'Lead Owner', 'Source', 'Lead Status', 'Date Created', 'Remark'].join(','),
      ...filteredLeads.map((lead) => [
        getLeadName(lead),
        getLeadPhone(lead),
        lead.email || '',
        lead.ownerName || '',
        getLeadSource(lead),
        lead.status,
        formatDateTime(lead.createdAt),
        getLeadRemark(lead),
      ].map((value) => escapeCsvCell(value)).join(',')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `connektly-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setIsImporting(true);
      setFeedback(null);
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length < 2) throw new Error('The CSV file is empty.');
      const headers = rows[0].map(normalizeCsvHeader);
      let successCount = 0;
      let skippedCount = 0;
      for (const row of rows.slice(1)) {
        const values = headers.reduce<Record<string, string>>((accumulator, header, index) => {
          accumulator[header] = row[index]?.trim() || '';
          return accumulator;
        }, {});
        const phone = values.phonenumber || values.phone || values.whatsappnumber || values.whatsapp || values.mobile || values.number;
        if (!phone) {
          skippedCount += 1;
          continue;
        }
        const response = await appApi.createContact({
          contactWaId: phone,
          contactName: values.name || values.leadname || values.fullname || values.contactname || '',
          displayPhone: phone,
          email: values.email || values.emailaddress || '',
          ownerName: values.leadowner || values.owner || values.ownername || defaultOwnerName,
          source: values.source || values.leadsource || 'CSV Import',
          status: normalizeStage(values.stage || values.status),
          remark: values.remark || values.remarks || values.note || values.notes || '',
        });
        syncLead(response.contact);
        successCount += 1;
      }
      setFeedback({ type: 'success', message: `CSV import finished. ${successCount} lead${successCount === 1 ? '' : 's'} added${skippedCount ? `, ${skippedCount} row${skippedCount === 1 ? '' : 's'} skipped` : ''}.` });
      setIsCsvImportOpen(false);
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Failed to import leads from CSV.' });
    } finally {
      event.currentTarget.value = '';
      setIsImporting(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lead List</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">Track leads, owners, status movement, and follow-up notes without opening the full inbox.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => setIsCreateModalOpen(true)} className="inline-flex items-center gap-2 rounded-2xl bg-[#5b45ff] px-4 py-3 text-sm font-medium text-white shadow-lg shadow-[#5b45ff]/25 transition hover:bg-[#4a35e8]"><Plus className="h-4 w-4" /> Create Lead</button>
          <button type="button" onClick={() => setIsCsvImportOpen(true)} disabled={isImporting} className="inline-flex items-center gap-2 rounded-2xl border border-gray-100 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition hover:bg-gray-50 disabled:opacity-60">{isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Import via CSV</button>
          <button type="button" onClick={handleExport} className="inline-flex items-center gap-2 rounded-2xl border border-gray-100 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition hover:bg-gray-50"><Download className="h-4 w-4" /> Export</button>
        </div>
      </div>

      {isCsvImportOpen ? (
        <CsvImportModal
          title="Import Leads CSV"
          description="Upload a CSV using the required headers below. Download the blank sample CSV first if you need the correct structure."
          sampleFilename="leads-sample.csv"
          sampleCsv={LEADS_SAMPLE_CSV}
          isImporting={isImporting}
          onClose={() => setIsCsvImportOpen(false)}
          onImport={handleImportFile}
        />
      ) : null}

      {feedback ? <div className={`rounded-2xl border px-4 py-3 text-sm ${feedback.type === 'success' ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-rose-100 bg-rose-50 text-rose-700'}`}>{feedback.message}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Total leads', value: stats.total, icon: UserPlus },
          { label: 'New leads', value: stats.new, icon: Plus },
          { label: 'Connected', value: stats.connected, icon: Save },
          { label: 'Converted', value: stats.converted, icon: CalendarDays },
        ].map((item) => (
          <div key={item.label} className="rounded-3xl bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)] ring-1 ring-gray-100">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-gray-500">{item.label}</p>
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#eef2ff] text-[#4338ca]"><item.icon className="h-4 w-4" /></div>
            </div>
            <p className="mt-4 text-2xl font-bold text-gray-900">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-3xl bg-white/95 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)] ring-1 ring-gray-100 sm:p-5">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-gray-900">Find a lead</p>
          <p className="text-xs text-gray-500">{filteredLeads.length} lead{filteredLeads.length === 1 ? '' : 's'} shown</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-gray-700">Search leads</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input type="text" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search by name, phone, email, owner, source, status, or remark" className="w-full rounded-2xl border border-transparent bg-gray-50 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]" />
            </div>
          </label>
          <div className="block">
            <span className="mb-2 block text-sm font-medium text-gray-700">Lead Status</span>
            <DropdownSelect
              value={stageFilter}
              onChange={(nextStage) => setStageFilter(nextStage as 'all' | ConversationThread['status'])}
              options={STAGE_OPTIONS.map((stage) => ({
                value: stage,
                label: stage === 'all' ? 'All statuses' : stage,
              }))}
              ariaLabel="Filter leads by status"
              buttonClassName="rounded-2xl border-transparent bg-gray-50 px-4 py-3 focus:border-[#5b45ff] focus:ring-[#5b45ff]/15"
            />
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[2rem] bg-white shadow-[0_18px_48px_rgba(15,23,42,0.07)] ring-1 ring-gray-100">
        {filteredLeads.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-[#f8fafc]">
                <tr>
                  {['Name', 'Phone Number', 'Email', 'Lead Owner', 'Source', 'Lead Status', 'Date Created', 'Remark'].map((label) => <th key={label} className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">{label}</th>)}
                  <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredLeads.map((lead) => (
                  <tr key={lead.id} className="align-top transition-colors hover:bg-[#fafafa]">
                    <td className="px-6 py-5"><div className="flex items-start gap-3"><img src={lead.avatarUrl || defaultProfilePictureUrl} alt={`${getLeadName(lead)} profile`} className="h-11 w-11 shrink-0 rounded-2xl object-cover" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.src = defaultProfilePictureUrl; }} draggable={false} /><div className="min-w-0"><p className="truncate text-sm font-semibold text-gray-900">{getLeadName(lead)}</p><p className="mt-1 truncate text-xs text-gray-500">{getLeadIdentifierLabel(lead)}</p></div></div></td>
                    <td className="px-6 py-5 text-sm text-gray-700">{getLeadPhone(lead)}</td>
                    <td className="px-6 py-5 text-sm text-gray-700">{lead.email || 'Not available'}</td>
                    <td className="px-6 py-5 text-sm text-gray-700">{lead.ownerName || 'Unassigned'}</td>
                    <td className="px-6 py-5 text-sm text-gray-700">{getLeadSource(lead)}</td>
                    <td className="px-6 py-5"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getStageClassName(lead.status)}`}>{lead.status}</span></td>
                    <td className="px-6 py-5 text-sm text-gray-700">{formatDateTime(lead.createdAt)}</td>
                    <td className="px-6 py-5 text-sm text-gray-600"><p className="max-w-[260px] whitespace-pre-wrap break-words">{getLeadRemark(lead) || 'No remark'}</p></td>
                    <td className="px-6 py-5"><div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setEditLeadId(lead.id)} className="inline-flex items-center gap-1 rounded-xl border border-gray-100 bg-white px-3 py-2 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"><Pencil className="h-3.5 w-3.5" /> Edit</button>
                      <button type="button" onClick={() => setUpdateLeadId(lead.id)} className="inline-flex items-center gap-1 rounded-xl border border-gray-100 bg-white px-3 py-2 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"><Save className="h-3.5 w-3.5" /> Update</button>
                      <button type="button" onClick={() => setTimelineLeadId(lead.id)} className="inline-flex items-center gap-1 rounded-xl border border-gray-100 bg-white px-3 py-2 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"><History className="h-3.5 w-3.5" /> Timeline</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="bg-[#fbfbfc] px-6 py-16 text-center"><UserPlus className="mx-auto h-10 w-10 text-gray-300" /><h2 className="mt-4 text-lg font-semibold text-gray-900">No leads to show</h2><p className="mx-auto mt-2 max-w-xl text-sm text-gray-500">Create a lead manually, import one from CSV, or let your live channels keep adding them here.</p></div>}
      </div>

      {isCreateModalOpen ? <ModalShell title="Create Lead" subtitle="Add a lead manually into CRM." onClose={() => setIsCreateModalOpen(false)}><LeadEditor form={leadForm} setForm={setLeadForm} ownerOptions={leadOwnerOptions} sourceOptions={leadSourceOptions} onClose={() => setIsCreateModalOpen(false)} onSubmit={() => void handleCreateLead()} submitLabel="Save Lead" isSubmitting={isSubmitting} /></ModalShell> : null}
      {editLead ? <ModalShell title="Edit Lead" subtitle={`Update the core details for ${getLeadName(editLead)}.`} onClose={() => setEditLeadId(null)}><LeadEditor form={leadForm} setForm={setLeadForm} ownerOptions={leadOwnerOptions} sourceOptions={leadSourceOptions} onClose={() => setEditLeadId(null)} onSubmit={() => void handleEditLead()} submitLabel="Save Changes" isSubmitting={isSubmitting} /></ModalShell> : null}
      {updateLead ? <ModalShell title="Update Lead" subtitle={`Update ${getLeadName(updateLead)} with the latest lead status or a fresh remark.`} onClose={() => setUpdateLeadId(null)}>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="block">
            <span className="mb-2 block text-sm font-medium text-gray-700">Lead Owner</span>
            <DropdownSelect
              value={updateForm.ownerName}
              onChange={(nextOwner) => setUpdateForm((current) => ({ ...current, ownerName: nextOwner }))}
              options={leadOwnerOptions}
              placeholder="Select an owner"
              ariaLabel="Select lead update owner"
              buttonClassName="rounded-2xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#5b45ff] focus:ring-[#5b45ff]/15"
            />
          </div>
          <div className="block">
            <span className="mb-2 block text-sm font-medium text-gray-700">Source</span>
            <DropdownSelect
              value={updateForm.source}
              onChange={(nextSource) => setUpdateForm((current) => ({ ...current, source: nextSource }))}
              options={leadSourceOptions}
              placeholder="Select a source"
              ariaLabel="Select lead update source"
              buttonClassName="rounded-2xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#5b45ff] focus:ring-[#5b45ff]/15"
            />
          </div>
          <div className="block">
            <span className="mb-2 block text-sm font-medium text-gray-700">Lead Status</span>
            <DropdownSelect
              value={updateForm.status}
              onChange={(nextStatus) =>
                setUpdateForm((current) => ({
                  ...current,
                  status: nextStatus as ConversationThread['status'],
                }))
              }
              options={STAGE_OPTIONS.filter((stage) => stage !== 'all').map((stage) => ({
                value: stage,
                label: stage,
              }))}
              ariaLabel="Select lead update status"
              buttonClassName="rounded-2xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#5b45ff] focus:ring-[#5b45ff]/15"
            />
          </div>
          <label className="block md:col-span-2"><span className="mb-2 block text-sm font-medium text-gray-700">Remark</span><textarea value={updateForm.remark} onChange={(event) => setUpdateForm((current) => ({ ...current, remark: event.target.value }))} rows={4} className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]" /></label>
        </div>
        <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setUpdateLeadId(null)} className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50">Cancel</button><button type="button" onClick={() => void handleQuickUpdate()} disabled={isSubmitting} className="inline-flex items-center gap-2 rounded-2xl bg-[#5b45ff] px-4 py-3 text-sm font-medium text-white shadow-lg shadow-[#5b45ff]/25 transition hover:bg-[#4a35e8] disabled:opacity-60">{isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Update Lead</button></div>
      </ModalShell> : null}
      {timelineLead ? <ModalShell title="Lead Timeline" subtitle={`Full activity timeline for ${getLeadName(timelineLead)}.`} onClose={() => setTimelineLeadId(null)}>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Phone Number</p><p className="mt-2 text-sm font-medium text-gray-900">{getLeadPhone(timelineLead)}</p></div>
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Date Created</p><p className="mt-2 text-sm font-medium text-gray-900">{formatDateTime(timelineLead.createdAt)}</p></div>
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Lead Status</p><span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getStageClassName(timelineLead.status)}`}>{timelineLead.status}</span></div>
        </div>
        {isTimelineLoading ? <div className="flex min-h-[220px] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#5b45ff]" /></div> : timelineError ? <div className="mt-6 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{timelineError}</div> : <div className="mt-6 space-y-4">{timelineMessages.length ? timelineMessages.map((message) => <div key={message.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${message.direction === 'inbound' ? 'border border-emerald-100 bg-emerald-50 text-emerald-700' : 'border border-blue-100 bg-blue-50 text-blue-700'}`}>{message.direction === 'inbound' ? 'Inbound' : 'Outbound'}</span><span className="text-xs font-medium uppercase tracking-[0.16em] text-gray-400">{message.messageType}</span></div><span className="text-xs text-gray-500">{formatDateTime(message.createdAt)}</span></div><p className="mt-3 whitespace-pre-wrap break-words text-sm text-gray-700">{message.body || 'No message body recorded for this event.'}</p>{message.status ? <p className="mt-2 text-xs text-gray-500">Status: {message.status}</p> : null}</div>) : <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">No timeline events are available for this lead yet.</div>}</div>}
      </ModalShell> : null}
    </div>
  );
}
