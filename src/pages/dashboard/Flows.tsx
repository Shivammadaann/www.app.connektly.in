import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  Eye,
  FileText,
  ListChecks,
  Loader2,
  MessageSquareText,
  MoreVertical,
  Pencil,
  Plus,
  RefreshCcw,
  Save,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { appApi } from '../../lib/api';
import { useAppData } from '../../context/AppDataContext';
import { useEscapeKey } from '../../lib/useEscapeKey';
import { DropdownSelect } from '../../components/ui/DropdownSelect';
import type {
  WhatsAppFlow,
  WhatsAppFlowCategory,
  WhatsAppFlowField,
  WhatsAppFlowFieldType,
  WhatsAppFlowInput,
} from '../../lib/types';

type FlowTemplateId = 'lead' | 'feedback' | 'booking' | 'custom';

interface FieldDraft extends WhatsAppFlowField {
  clientId: string;
  optionsText: string;
}

interface FlowDraft {
  name: string;
  category: WhatsAppFlowCategory;
  publish: boolean;
  fields: FieldDraft[];
}

const FLOW_CATEGORY_OPTIONS: Array<{ value: WhatsAppFlowCategory; label: string }> = [
  { value: 'LEAD_GENERATION', label: 'Lead generation' },
  { value: 'SURVEY', label: 'Feedback / survey' },
  { value: 'APPOINTMENT_BOOKING', label: 'Booking / scheduling' },
  { value: 'CONTACT_US', label: 'Contact us' },
  { value: 'CUSTOMER_SUPPORT', label: 'Customer support' },
  { value: 'SIGN_UP', label: 'Sign up' },
  { value: 'SIGN_IN', label: 'Sign in' },
  { value: 'OTHER', label: 'Other' },
];

const FIELD_TYPE_OPTIONS: Array<{ value: WhatsAppFlowFieldType; label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Select' },
];

const FLOW_TEMPLATES: Array<{
  id: FlowTemplateId;
  label: string;
  defaultName: string;
  category: WhatsAppFlowCategory;
  fields: WhatsAppFlowField[];
}> = [
  {
    id: 'lead',
    label: 'Lead Collection',
    defaultName: 'Lead Collection Flow',
    category: 'LEAD_GENERATION',
    fields: [
      { id: 'name', type: 'text', label: 'Name', required: true },
      { id: 'phone', type: 'phone', label: 'Phone', required: true },
      { id: 'email', type: 'email', label: 'Email', required: false },
    ],
  },
  {
    id: 'feedback',
    label: 'Feedback / Survey',
    defaultName: 'Feedback Flow',
    category: 'SURVEY',
    fields: [
      { id: 'rating', type: 'select', label: 'Rating', required: true, options: ['1', '2', '3', '4', '5'] },
      { id: 'comments', type: 'text', label: 'Comments', required: false },
    ],
  },
  {
    id: 'booking',
    label: 'Booking / Scheduling',
    defaultName: 'Booking Flow',
    category: 'APPOINTMENT_BOOKING',
    fields: [
      { id: 'name', type: 'text', label: 'Name', required: true },
      { id: 'date', type: 'date', label: 'Date', required: true },
      { id: 'time', type: 'text', label: 'Time', required: true },
    ],
  },
  {
    id: 'custom',
    label: 'Custom',
    defaultName: 'Custom Flow',
    category: 'OTHER',
    fields: [{ id: 'field_1', type: 'text', label: 'Field 1', required: true }],
  },
];

function createClientId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
}

function toFieldId(value: string, fallback: string, index: number, seenIds: Set<string>) {
  let base = (value || fallback || `field_${index + 1}`)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!base) {
    base = `field_${index + 1}`;
  }

  if (/^\d/.test(base)) {
    base = `field_${base}`;
  }

  base = base.slice(0, 42).replace(/_+$/g, '') || `field_${index + 1}`;

  let candidate = base;
  let suffix = 2;
  while (seenIds.has(candidate)) {
    const suffixText = `_${suffix}`;
    candidate = `${base.slice(0, Math.max(1, 48 - suffixText.length))}${suffixText}`;
    suffix += 1;
  }

  seenIds.add(candidate);
  return candidate;
}

function createFieldDraft(field?: Partial<WhatsAppFlowField>, index = 0): FieldDraft {
  const label = field?.label || `Field ${index + 1}`;
  return {
    clientId: createClientId(),
    id: field?.id || toFieldId('', label, index, new Set()),
    type: field?.type || 'text',
    label,
    required: field?.required ?? true,
    options: field?.options || [],
    optionsText: (field?.options || []).join('\n'),
    validation: field?.validation,
  };
}

function createDraft(templateId: FlowTemplateId = 'lead'): FlowDraft {
  const template = FLOW_TEMPLATES.find((item) => item.id === templateId) || FLOW_TEMPLATES[0];

  return {
    name: template.defaultName,
    category: template.category,
    publish: false,
    fields: template.fields.map((field, index) => createFieldDraft(field, index)),
  };
}

function createDraftFromFlow(flow: WhatsAppFlow): FlowDraft {
  return {
    name: flow.name,
    category: flow.categories[0] || 'OTHER',
    publish: false,
    fields: flow.schema.length
      ? flow.schema.map((field, index) => createFieldDraft(field, index))
      : [createFieldDraft(undefined, 0)],
  };
}

function parseOptions(value: string) {
  return Array.from(
    new Set(
      value
        .split(/\r?\n|,/)
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
}

function buildFlowPayload(draft: FlowDraft): WhatsAppFlowInput {
  const name = draft.name.trim();

  if (!name) {
    throw new Error('Flow name is required.');
  }

  const seenIds = new Set<string>();
  const schema = draft.fields.map((field, index): WhatsAppFlowField => {
    const label = field.label.trim();

    if (!label) {
      throw new Error('Every field needs a label.');
    }

    const normalizedField: WhatsAppFlowField = {
      id: toFieldId(field.id, label, index, seenIds),
      type: field.type,
      label,
      required: field.required,
    };

    if (field.type === 'select') {
      const options = parseOptions(field.optionsText);

      if (options.length === 0) {
        throw new Error(`Add options for ${label}.`);
      }

      normalizedField.options = options;
    }

    return normalizedField;
  });

  if (schema.length === 0) {
    throw new Error('Add at least one field.');
  }

  return {
    name,
    categories: [draft.category],
    schema,
    publish: draft.publish,
  };
}

function formatDateTime(value: string | null) {
  if (!value) return 'Not available';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString();
}

function getCategoryLabel(category: string | null | undefined) {
  return FLOW_CATEGORY_OPTIONS.find((option) => option.value === category)?.label || category || 'Other';
}

function getStatusClassName(status: string) {
  switch (status.toUpperCase()) {
    case 'PUBLISHED':
      return 'border-emerald-100 bg-emerald-50 text-emerald-700';
    case 'DRAFT':
      return 'border-amber-100 bg-amber-50 text-amber-700';
    case 'THROTTLED':
      return 'border-orange-100 bg-orange-50 text-orange-700';
    case 'BLOCKED':
    case 'DEPRECATED':
      return 'border-rose-100 bg-rose-50 text-rose-700';
    default:
      return 'border-gray-200 bg-gray-50 text-gray-700';
  }
}

function getFieldTypeLabel(type: WhatsAppFlowFieldType) {
  return FIELD_TYPE_OPTIONS.find((option) => option.value === type)?.label || type;
}

function ModalShell({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: ReactNode }) {
  useEscapeKey(true, onClose);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[130] overflow-y-auto">
      <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm" />
      <div className="relative flex min-h-full items-center justify-center px-4 py-6">
        <div
          role="dialog"
          aria-modal="true"
          className="flex max-h-[calc(100dvh-3rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/40 bg-white shadow-2xl"
        >
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
            <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">{children}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function StatCard({ title, value, icon }: { title: string; value: string; icon: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#5b45ff]/10 text-[#5b45ff]">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium uppercase tracking-[0.1em] text-gray-500">{title}</p>
        <p className="mt-0.5 truncate text-sm font-semibold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

function FlowEditor({
  mode,
  draft,
  isSubmitting,
  onClose,
  onSubmit,
  onDraftChange,
}: {
  mode: 'create' | 'edit';
  draft: FlowDraft;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: () => void;
  onDraftChange: (draft: FlowDraft) => void;
}) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<FlowTemplateId>('lead');

  const updateField = (clientId: string, updater: (field: FieldDraft) => FieldDraft) => {
    onDraftChange({
      ...draft,
      fields: draft.fields.map((field) => (field.clientId === clientId ? updater(field) : field)),
    });
  };

  const applyTemplate = (templateId: FlowTemplateId) => {
    const template = FLOW_TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;

    setSelectedTemplateId(templateId);
    onDraftChange({
      ...draft,
      name: draft.name.trim() ? draft.name : template.defaultName,
      category: template.category,
      fields: template.fields.map((field, index) => createFieldDraft(field, index)),
    });
  };

  return (
    <ModalShell
      title={mode === 'create' ? 'Create Flow' : 'Edit Flow'}
      subtitle="Build a form schema that can be launched from chat automations."
      onClose={onClose}
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-700">Flow Name</span>
              <input
                value={draft.name}
                onChange={(event) => onDraftChange({ ...draft, name: event.target.value })}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
              />
            </label>
            <div className="block">
              <span className="mb-2 block text-sm font-medium text-gray-700">Use Case</span>
              <DropdownSelect
                value={selectedTemplateId}
                onChange={(nextTemplateId) => applyTemplate(nextTemplateId as FlowTemplateId)}
                options={FLOW_TEMPLATES.map((template) => ({
                  value: template.id,
                  label: template.label,
                }))}
                ariaLabel="Select flow use case"
                buttonClassName="rounded-xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#5b45ff] focus:ring-[#5b45ff]/15"
              />
            </div>
            <div className="block">
              <span className="mb-2 block text-sm font-medium text-gray-700">Category</span>
              <DropdownSelect
                value={draft.category}
                onChange={(nextCategory) => onDraftChange({ ...draft, category: nextCategory as WhatsAppFlowCategory })}
                options={FLOW_CATEGORY_OPTIONS}
                ariaLabel="Select flow category"
                buttonClassName="rounded-xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#5b45ff] focus:ring-[#5b45ff]/15"
              />
            </div>
            {mode === 'create' ? (
              <label className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <span>
                  <span className="block text-sm font-medium text-gray-700">Publish immediately</span>
                  <span className="mt-1 block text-xs text-gray-500">Published Flows cannot be edited.</span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={draft.publish}
                  onClick={() => onDraftChange({ ...draft, publish: !draft.publish })}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition ${
                    draft.publish ? 'border-emerald-400 bg-emerald-500' : 'border-gray-300 bg-gray-200'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                      draft.publish ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </label>
            ) : null}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Fields</h3>
                <p className="mt-0.5 text-xs text-gray-500">{draft.fields.length} configured</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onDraftChange({
                    ...draft,
                    fields: [...draft.fields, createFieldDraft(undefined, draft.fields.length)],
                  })
                }
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
              >
                <Plus className="h-4 w-4" />
                Add Field
              </button>
            </div>
            <div className="divide-y divide-gray-100">
              {draft.fields.map((field, index) => (
                <div key={field.clientId} className="grid gap-3 px-4 py-4 lg:grid-cols-[1.2fr_1fr_0.8fr_auto_auto]">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-gray-600">Label</span>
                    <input
                      value={field.label}
                      onChange={(event) =>
                        updateField(field.clientId, (current) => ({ ...current, label: event.target.value }))
                      }
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-gray-600">Attribute Key</span>
                    <input
                      value={field.id}
                      onChange={(event) =>
                        updateField(field.clientId, (current) => ({ ...current, id: event.target.value }))
                      }
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                    />
                  </label>
                  <div className="block">
                    <span className="mb-1.5 block text-xs font-medium text-gray-600">Type</span>
                    <DropdownSelect
                      value={field.type}
                      onChange={(nextType) =>
                        updateField(field.clientId, (current) => ({
                          ...current,
                          type: nextType as WhatsAppFlowFieldType,
                        }))
                      }
                      options={FIELD_TYPE_OPTIONS}
                      ariaLabel="Select flow field type"
                      buttonClassName="rounded-xl border-gray-200 bg-gray-50 px-3 py-2.5 focus:border-[#5b45ff] focus:ring-[#5b45ff]/15"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={field.required}
                      onClick={() => updateField(field.clientId, (current) => ({ ...current, required: !current.required }))}
                      className={`mb-0.5 inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-medium transition ${
                        field.required
                          ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                          : 'border-gray-200 bg-white text-gray-500'
                      }`}
                    >
                      {field.required ? 'Required' : 'Optional'}
                    </button>
                  </div>
                  <div className="flex items-end justify-end">
                    <button
                      type="button"
                      onClick={() => onDraftChange({ ...draft, fields: draft.fields.filter((item) => item.clientId !== field.clientId) })}
                      disabled={draft.fields.length === 1}
                      title="Remove field"
                      className="mb-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-rose-100 bg-white text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {field.type === 'select' ? (
                    <label className="block lg:col-span-5">
                      <span className="mb-1.5 block text-xs font-medium text-gray-600">Options</span>
                      <textarea
                        value={field.optionsText}
                        onChange={(event) =>
                          updateField(field.clientId, (current) => ({ ...current, optionsText: event.target.value }))
                        }
                        rows={3}
                        placeholder="One option per line"
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                      />
                    </label>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="mx-auto w-full max-w-[360px] rounded-2xl bg-[#e9e9e7] p-2 shadow-sm">
            <div className="relative flex h-[570px] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-[0_8px_22px_rgba(15,23,42,0.12)]">
              <div className="h-10 bg-[#b7b7b7]">
                <div className="ml-7 mt-4 h-9 w-9 rounded-full bg-[#168a54]" />
              </div>
              <div className="relative z-10 -mt-1 flex min-h-14 items-center justify-between border-b border-gray-100 bg-white px-4 shadow-[0_1px_3px_rgba(15,23,42,0.08)]">
                <button type="button" aria-label="Close preview" className="flex h-8 w-8 items-center justify-center rounded-full text-gray-900">
                  <X className="h-5 w-5" />
                </button>
                <p className="min-w-0 flex-1 truncate px-3 text-center text-[15px] font-medium text-gray-900">
                  {draft.name || 'Flow'}
                </p>
                <button type="button" aria-label="More preview options" className="flex h-8 w-8 items-center justify-center rounded-full text-gray-900">
                  <MoreVertical className="h-5 w-5" />
                </button>
              </div>

              <div className="flex min-h-0 flex-1 flex-col bg-white">
                <div className="flex-1 space-y-7 overflow-hidden px-4 py-7">
                  {draft.fields.slice(0, 6).map((field) => (
                    <div
                      key={field.clientId}
                      className="flex h-[54px] items-center rounded-lg border border-[#aab1b8] bg-white px-4 text-[15px] font-medium text-[#6d747b] shadow-[0_1px_1px_rgba(15,23,42,0.04)]"
                    >
                      <span className="truncate">
                        {field.label || 'Untitled field'}
                        {!field.required ? ' (optional)' : ''}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-gray-100 bg-white px-4 pb-3 pt-3">
                  <button
                    type="button"
                    disabled
                    className="flex h-11 w-full cursor-not-allowed items-center justify-center rounded-full bg-[#f4f2f1] text-sm font-semibold text-[#bac2c9]"
                  >
                    Submit
                  </button>
                  <p className="mt-3 text-center text-[11px] font-semibold text-[#5f666d]">
                    Managed by the business. <span className="text-[#098d52]">Learn more</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-xl bg-[#5b45ff] px-4 py-3 text-sm font-medium text-white shadow-lg shadow-[#5b45ff]/25 transition hover:bg-[#4a35e8] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {mode === 'create' ? 'Create Flow' : 'Save Changes'}
            </button>
          </div>
        </aside>
      </div>
    </ModalShell>
  );
}

export default function Flows() {
  const { bootstrap } = useAppData();
  const channel = bootstrap?.channel || null;
  const [flows, setFlows] = useState<WhatsAppFlow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [busyFlowId, setBusyFlowId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | null>(null);
  const [editingFlow, setEditingFlow] = useState<WhatsAppFlow | null>(null);
  const [draft, setDraft] = useState<FlowDraft>(() => createDraft());

  const stats = useMemo(() => {
    const published = flows.filter((flow) => flow.status === 'PUBLISHED').length;
    const drafts = flows.filter((flow) => flow.status === 'DRAFT').length;
    const submissions = flows.reduce((total, flow) => total + flow.submissionCount, 0);
    const lastUpdatedAt =
      flows
        .map((flow) => flow.updatedAt)
        .filter(Boolean)
        .sort((left, right) => Date.parse(right) - Date.parse(left))[0] || null;

    return { published, drafts, submissions, lastUpdatedAt };
  }, [flows]);

  const sortFlows = (items: WhatsAppFlow[]) => {
    return [...items].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  };

  const upsertFlow = (flow: WhatsAppFlow) => {
    setFlows((current) => sortFlows([flow, ...current.filter((item) => item.id !== flow.id)]));
  };

  const loadFlows = async () => {
    if (!channel) {
      setFlows([]);
      setIsLoading(false);
      setFeedback(null);
      return;
    }

    try {
      setIsLoading(true);
      setFeedback(null);
      const response = await appApi.getFlows();
      setFlows(sortFlows(response.flows));
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Failed to load Flows.' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadFlows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel?.id]);

  const openCreateEditor = () => {
    setDraft(createDraft());
    setEditingFlow(null);
    setEditorMode('create');
    setFeedback(null);
  };

  const openEditEditor = (flow: WhatsAppFlow) => {
    if (flow.status === 'PUBLISHED') {
      setFeedback({ type: 'error', message: 'Published Flows are immutable. Create a new draft to change fields.' });
      return;
    }

    setDraft(createDraftFromFlow(flow));
    setEditingFlow(flow);
    setEditorMode('edit');
    setFeedback(null);
  };

  const closeEditor = () => {
    if (isSubmitting) return;
    setEditorMode(null);
    setEditingFlow(null);
  };

  const handleSubmitEditor = async () => {
    if (!editorMode) return;

    try {
      setIsSubmitting(true);
      setFeedback(null);
      const payload = buildFlowPayload(draft);
      const response =
        editorMode === 'create'
          ? await appApi.createFlow(payload)
          : await appApi.updateFlow(editingFlow!.id, {
              name: payload.name,
              categories: payload.categories,
              schema: payload.schema,
            });

      upsertFlow(response.flow);
      setFeedback({ type: 'success', message: editorMode === 'create' ? 'Flow created.' : 'Flow updated.' });
      setEditorMode(null);
      setEditingFlow(null);
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Failed to save Flow.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePublishFlow = async (flow: WhatsAppFlow) => {
    if (!globalThis.confirm('Publishing makes this Flow immutable. Continue?')) {
      return;
    }

    try {
      setBusyFlowId(flow.id);
      setFeedback(null);
      const response = await appApi.publishFlow(flow.id);
      upsertFlow(response.flow);
      setFeedback({ type: 'success', message: 'Flow published.' });
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Failed to publish Flow.' });
    } finally {
      setBusyFlowId(null);
    }
  };

  const handlePreviewFlow = async (flow: WhatsAppFlow) => {
    try {
      setBusyFlowId(flow.id);
      setFeedback(null);
      const response = await appApi.getFlowPreview(flow.id);
      upsertFlow(response.flow);

      if (response.flow.previewUrl) {
        globalThis.open(response.flow.previewUrl, '_blank', 'noopener,noreferrer');
      } else {
        setFeedback({ type: 'error', message: 'Meta did not return a preview URL for this Flow.' });
      }
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Failed to open Flow preview.' });
    } finally {
      setBusyFlowId(null);
    }
  };

  const handleDeleteFlow = async (flow: WhatsAppFlow) => {
    if (!globalThis.confirm(`Delete ${flow.name}?`)) {
      return;
    }

    try {
      setBusyFlowId(flow.id);
      setFeedback(null);
      await appApi.deleteFlow(flow.id);
      setFlows((current) => current.filter((item) => item.id !== flow.id));
      setFeedback({ type: 'success', message: 'Flow deleted.' });
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Failed to delete Flow.' });
    } finally {
      setBusyFlowId(null);
    }
  };

  if (!channel) {
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-2xl border border-gray-200 bg-white px-6 py-8 shadow-sm sm:px-8 sm:py-10">
          <div className="max-w-3xl">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#eef2ff] text-[#4338ca]">
              <ListChecks className="h-6 w-6" />
            </div>
            <h1 className="mt-5 text-2xl font-bold text-gray-900">Flows</h1>
            <p className="mt-1 text-sm text-gray-500">
              Connect a WhatsApp Business number before creating chat Flows.
            </p>
            <div className="mt-6">
              <Link
                to="/dashboard/channels"
                className="inline-flex items-center gap-2 rounded-xl bg-[#5b45ff] px-4 py-3 text-sm font-medium text-white shadow-lg shadow-[#5b45ff]/25 transition hover:bg-[#4a35e8]"
              >
                Open Channels
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Flows</h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-500">
            Create structured chat forms for lead capture, feedback, and booking workflows.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void loadFlows()}
            disabled={isLoading || Boolean(busyFlowId)}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            Refresh
          </button>
          <button
            type="button"
            onClick={openCreateEditor}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-xl bg-[#5b45ff] px-4 py-3 text-sm font-medium text-white shadow-lg shadow-[#5b45ff]/25 transition hover:bg-[#4a35e8] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            Create Flow
          </button>
        </div>
      </div>

      {feedback ? (
        <div
          className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
            feedback.type === 'success'
              ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
              : 'border-rose-100 bg-rose-50 text-rose-700'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-4">
        <StatCard title="Published" value={String(stats.published)} icon={<Send className="h-4 w-4" />} />
        <StatCard title="Drafts" value={String(stats.drafts)} icon={<FileText className="h-4 w-4" />} />
        <StatCard title="Submissions" value={String(stats.submissions)} icon={<MessageSquareText className="h-4 w-4" />} />
        <StatCard title="Last updated" value={formatDateTime(stats.lastUpdatedAt)} icon={<CalendarDays className="h-4 w-4" />} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="flex min-h-56 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[#5b45ff]" />
          </div>
        ) : flows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] table-fixed divide-y divide-gray-200">
              <colgroup>
                <col className="w-[28%]" />
                <col className="w-[15%]" />
                <col className="w-[19%]" />
                <col className="w-[11%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[17%]" />
              </colgroup>
              <thead className="bg-gray-50">
                <tr>
                  {['Flow Name', 'Type', 'Fields', 'Status', 'Submissions', 'Updated'].map((label) => (
                    <th key={label} className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                      {label}
                    </th>
                  ))}
                  <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {flows.map((flow) => {
                  const isBusy = busyFlowId === flow.id;
                  const isPublished = flow.status === 'PUBLISHED';
                  const isDraft = flow.status === 'DRAFT';

                  return (
                    <tr key={flow.id} className="align-middle transition-colors hover:bg-gray-50">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#5b45ff]/10 text-[#5b45ff]">
                            <ListChecks className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-gray-900">{flow.name}</p>
                            <p className="mt-1 truncate text-xs text-gray-500">Meta ID: {flow.metaFlowId || 'Not synced'}</p>
                            {flow.lastError ? <p className="mt-1 truncate text-xs text-rose-600">{flow.lastError}</p> : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-block max-w-full truncate rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium leading-5 text-gray-700">
                          {getCategoryLabel(flow.categories[0])}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-1.5">
                          {flow.schema.slice(0, 3).map((field) => (
                            <span key={field.id} className="rounded-lg bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-600">
                              {field.label}
                            </span>
                          ))}
                          {flow.schema.length > 3 ? (
                            <span className="rounded-lg bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-600">
                              +{flow.schema.length - 3}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusClassName(flow.status)}`}>
                          {flow.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm font-semibold text-gray-900">{flow.submissionCount}</td>
                      <td className="px-5 py-4 text-xs text-gray-500">{formatDateTime(flow.updatedAt)}</td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => void handlePreviewFlow(flow)}
                            disabled={isBusy}
                            title="Preview"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                          </button>
                          {flow.previewUrl ? (
                            <a
                              href={flow.previewUrl}
                              target="_blank"
                              rel="noreferrer"
                              title="Open last preview"
                              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 hover:text-gray-900"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => void handlePublishFlow(flow)}
                            disabled={!isDraft || isBusy}
                            title={isDraft ? 'Publish' : 'Only drafts can be published'}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Send className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditEditor(flow)}
                            disabled={isPublished || isBusy}
                            title={isPublished ? 'Published Flows cannot be edited' : 'Edit'}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteFlow(flow)}
                            disabled={!isDraft || isBusy}
                            title={isDraft ? 'Delete' : 'Only drafts can be deleted'}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-rose-100 bg-white text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#5b45ff]/10 text-[#5b45ff]">
              <ListChecks className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-gray-900">No Flows yet</h2>
            <p className="mt-1 max-w-md text-sm text-gray-500">
              Create a draft Flow, preview it, then publish it when the form is ready for chat execution.
            </p>
            <button
              type="button"
              onClick={openCreateEditor}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#5b45ff] px-4 py-3 text-sm font-medium text-white shadow-lg shadow-[#5b45ff]/25 transition hover:bg-[#4a35e8]"
            >
              <Plus className="h-4 w-4" />
              Create Flow
            </button>
          </div>
        )}
      </div>

      {editorMode ? (
        <FlowEditor
          mode={editorMode}
          draft={draft}
          isSubmitting={isSubmitting}
          onClose={closeEditor}
          onSubmit={() => void handleSubmitEditor()}
          onDraftChange={setDraft}
        />
      ) : null}
    </div>
  );
}
