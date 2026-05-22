import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  FileText,
  ListChecks,
  Loader2,
  MessageSquareText,
  Pencil,
  Plus,
  RefreshCcw,
  Save,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { appApi } from '../../lib/api';
import { useAppData } from '../../context/AppDataContext';
import { useEscapeKey } from '../../lib/useEscapeKey';
import { DropdownSelect } from '../../components/ui/DropdownSelect';
import type {
  AutomationRule,
  AutomationRuleActionType,
  AutomationRuleFilterCondition,
  AutomationRuleFilterGroup,
  AutomationRuleFilterOperator,
  AutomationRuleFilterType,
  AutomationRuleInput,
  AutomationRuleKeywordMatchMode,
  AutomationRuleTriggerType,
  MetaTemplate,
  WhatsAppFlow,
} from '../../lib/types';
import { sortMetaTemplates } from '../../lib/templates';

type EditableTriggerType = Exclude<AutomationRuleTriggerType, 'incoming_message_keyword'>;
type FilterConditionDraft = Required<Pick<AutomationRuleFilterCondition, 'id' | 'type' | 'operator'>> &
  Omit<AutomationRuleFilterCondition, 'id' | 'type' | 'operator'>;

interface RuleDraft {
  clientId: string;
  id?: string;
  name: string;
  isEnabled: boolean;
  triggerType: EditableTriggerType;
  keyword: string;
  keywordMatchMode: AutomationRuleKeywordMatchMode;
  filters: AutomationRuleFilterGroup;
  actionType: AutomationRuleActionType;
  messageBody: string;
  templateName: string;
  templateLanguage: string;
  flowId: string;
  flowCta: string;
  flowHeader: string;
  flowBody: string;
  flowFooter: string;
  flowMode: 'draft' | 'published';
  flowToken: string;
  flowScreen: string;
  lastTriggeredAt: string | null;
  triggerCount: number;
  lastError: string | null;
}

const TRIGGER_OPTIONS: Array<{ value: EditableTriggerType; label: string }> = [
  { value: 'whatsapp_message_received', label: 'New WhatsApp message' },
  { value: 'instagram_message_received', label: 'New Instagram message' },
  { value: 'contact_attribute_added', label: 'New contact attribute' },
  { value: 'contact_attribute_changed', label: 'Contact attribute changed' },
  { value: 'lead_created', label: 'New lead list entry' },
];

const FILTER_TYPE_OPTIONS: Array<{ value: AutomationRuleFilterType; label: string }> = [
  { value: 'message_contains_keywords', label: 'Incoming message contains keywords' },
  { value: 'contact_initiates_chat', label: 'Contact initiates new chat' },
  { value: 'timestamp', label: 'Timestamp' },
  { value: 'no_keyword_matches', label: 'No keyword matches' },
  { value: 'contact_exists', label: 'Contact exists' },
  { value: 'contact_attribute', label: 'Contact attributes' },
];

function createClientId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
}

function getEditableTriggerType(value?: AutomationRuleTriggerType): EditableTriggerType {
  if (
    value === 'instagram_message_received' ||
    value === 'contact_attribute_added' ||
    value === 'contact_attribute_changed' ||
    value === 'lead_created'
  ) {
    return value;
  }

  return 'whatsapp_message_received';
}

function createFilterCondition(type: AutomationRuleFilterType = 'message_contains_keywords'): FilterConditionDraft {
  return {
    id: createClientId(),
    type,
    operator: getDefaultFilterOperator(type),
    field: '',
    value: '',
    values: type === 'message_contains_keywords' ? [''] : [],
    startTime: '09:00',
    endTime: '18:00',
  };
}

function createDefaultFilterGroup(): AutomationRuleFilterGroup {
  return {
    operator: 'AND',
    conditions: [createFilterCondition()],
  };
}

function getDefaultFilterOperator(type: AutomationRuleFilterType): AutomationRuleFilterOperator {
  switch (type) {
    case 'timestamp':
      return 'between';
    case 'contact_exists':
    case 'contact_initiates_chat':
      return 'is_true';
    case 'contact_attribute':
      return 'equals';
    case 'no_keyword_matches':
      return 'is_true';
    case 'message_contains_keywords':
    default:
      return 'contains_any';
  }
}

function normalizeFilterGroupForDraft(rule?: AutomationRule): AutomationRuleFilterGroup {
  if (rule?.filters) {
    return {
      operator: rule.filters.operator === 'OR' ? 'OR' : 'AND',
      conditions: rule.filters.conditions.length ? rule.filters.conditions : [],
    };
  }

  if (rule?.action.filters) {
    return {
      operator: rule.action.filters.operator === 'OR' ? 'OR' : 'AND',
      conditions: rule.action.filters.conditions.length ? rule.action.filters.conditions : [],
    };
  }

  const keywordMatchMode = rule?.keywordMatchMode === 'any' || rule?.keyword === '*' ? 'any' : rule?.keywordMatchMode || 'contains';

  if (!rule || keywordMatchMode === 'any') {
    return createDefaultFilterGroup();
  }

  return {
    operator: 'AND',
    conditions: [
      {
        id: createClientId(),
        type: 'message_contains_keywords',
        operator:
          keywordMatchMode === 'equals' ||
          keywordMatchMode === 'starts_with' ||
          keywordMatchMode === 'ends_with' ||
          keywordMatchMode === 'fuzzy'
            ? keywordMatchMode
            : 'contains_any',
        values: [rule.keyword],
      },
    ],
  };
}

function createRuleDraft(rule?: AutomationRule): RuleDraft {
  const action = rule?.action;
  const actionType = action?.type || 'send_text';
  const keywordMatchMode = rule?.keywordMatchMode === 'any' || rule?.keyword === '*' ? 'any' : rule?.keywordMatchMode || 'contains';

  return {
    clientId: createClientId(),
    id: rule?.id,
    name: rule?.name || '',
    isEnabled: rule ? rule.isEnabled : true,
    triggerType: getEditableTriggerType(rule?.triggerType),
    keyword: keywordMatchMode === 'any' ? '' : rule?.keyword || '',
    keywordMatchMode,
    filters: normalizeFilterGroupForDraft(rule),
    actionType,
    messageBody: actionType === 'send_text' ? action?.messageBody || '' : '',
    templateName: actionType === 'send_template' ? action?.templateName || '' : '',
    templateLanguage: actionType === 'send_template' ? action?.templateLanguage || '' : '',
    flowId: actionType === 'send_flow' ? action?.flowId || '' : '',
    flowCta: actionType === 'send_flow' ? action?.flowCta || 'Open Flow' : 'Open Flow',
    flowHeader: actionType === 'send_flow' ? action?.flowHeader || '' : '',
    flowBody: actionType === 'send_flow' ? action?.flowBody || 'Please complete this form.' : 'Please complete this form.',
    flowFooter: actionType === 'send_flow' ? action?.flowFooter || '' : '',
    flowMode: actionType === 'send_flow' && action?.flowMode === 'draft' ? 'draft' : 'published',
    flowToken: actionType === 'send_flow' ? action?.flowToken || '' : '',
    flowScreen: actionType === 'send_flow' ? action?.flowScreen || '' : '',
    lastTriggeredAt: rule?.lastTriggeredAt || null,
    triggerCount: rule?.triggerCount || 0,
    lastError: rule?.lastError || null,
  };
}

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Not run yet';
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Not run yet' : parsed.toLocaleString();
}

function getTemplateOptionValue(template: MetaTemplate) {
  return `${template.name}::${template.language}`;
}

function getFlowEntryScreen(flow: WhatsAppFlow | null | undefined) {
  const flowJson = flow?.raw?.flow_json;
  const screens = flowJson && typeof flowJson === 'object' && !Array.isArray(flowJson)
    ? (flowJson as { screens?: unknown }).screens
    : null;
  const firstScreen = Array.isArray(screens) && screens[0] && typeof screens[0] === 'object'
    ? screens[0] as { id?: unknown }
    : null;

  return typeof firstScreen?.id === 'string' && firstScreen.id.trim() ? firstScreen.id.trim() : '';
}

function getFlowOptionLabel(flow: WhatsAppFlow) {
  return `${flow.name} (${flow.status})`;
}

function isSendableTemplate(template: MetaTemplate) {
  const status = template.status?.trim().toUpperCase();
  return !status || status === 'APPROVED';
}

function getTriggerLabel(triggerType: AutomationRuleTriggerType) {
  return TRIGGER_OPTIONS.find((option) => option.value === getEditableTriggerType(triggerType))?.label || 'New WhatsApp message';
}

function getFilterSubject(triggerType: EditableTriggerType) {
  switch (triggerType) {
    case 'instagram_message_received':
      return 'Instagram message';
    case 'contact_attribute_added':
      return 'Attribute name';
    case 'contact_attribute_changed':
      return 'Attribute name or value';
    case 'whatsapp_message_received':
    default:
      return 'WhatsApp message';
  }
}

function getConditionLabel(type: AutomationRuleFilterType) {
  return FILTER_TYPE_OPTIONS.find((option) => option.value === type)?.label || 'Filter';
}

function getConditionSummary(condition: AutomationRuleFilterCondition) {
  switch (condition.type) {
    case 'message_contains_keywords':
      return `Message ${
        condition.operator === 'equals'
          ? 'equals'
          : condition.operator === 'starts_with'
            ? 'starts with'
            : condition.operator === 'ends_with'
              ? 'ends with'
              : condition.operator === 'fuzzy'
                ? 'fuzzy matches'
                : 'contains'
      } ${condition.values?.filter(Boolean).join(', ') || 'keywords'}`;
    case 'contact_initiates_chat':
      return 'Contact initiates new chat';
    case 'timestamp':
      return `${condition.operator === 'outside' ? 'Outside' : 'Between'} ${condition.startTime || '09:00'} and ${condition.endTime || '18:00'}`;
    case 'no_keyword_matches':
      return 'No keyword rules matched';
    case 'contact_exists':
      return condition.operator === 'is_false' ? 'Contact does not exist' : 'Contact exists';
    case 'contact_attribute':
      return `${condition.field || 'Attribute'} ${
        condition.operator === 'contains'
          ? 'contains'
          : condition.operator === 'does_not_equal'
            ? 'does not equal'
            : 'equals'
      } ${condition.value || 'value'}`;
    default:
      return 'Filter';
  }
}

function getFilterSummary(rule: RuleDraft) {
  if (rule.filters.conditions.length > 0) {
    const summaries = rule.filters.conditions.slice(0, 2).map(getConditionSummary);
    return `${summaries.join(` ${rule.filters.operator} `)}${rule.filters.conditions.length > 2 ? ` +${rule.filters.conditions.length - 2}` : ''}`;
  }

  const subject = getFilterSubject(rule.triggerType);

  return `Any ${subject.toLowerCase()}`;
}

function getActionSummary(rule: RuleDraft) {
  if (rule.actionType === 'opt_out_marketing') {
    return 'Opt out of marketing';
  }

  if (rule.actionType === 'send_template') {
    return rule.templateName ? `Send template: ${rule.templateName}` : 'Send template';
  }

  if (rule.actionType === 'send_flow') {
    return rule.flowId ? `Send Flow: ${rule.flowCta || 'Open Flow'}` : 'Send Flow';
  }

  return 'Send message';
}

function getRuleTitle(rule: RuleDraft, index?: number) {
  return rule.name.trim() || (typeof index === 'number' ? `Trigger ${index + 1}` : 'Untitled trigger');
}

function buildRulePayload(rules: RuleDraft[]): AutomationRuleInput[] {
  return rules.map((rule, index) => {
    const name = getRuleTitle(rule, index);
    const normalizedFilters: AutomationRuleFilterGroup = {
      operator: rule.filters.operator,
      conditions: rule.filters.conditions.map((condition, conditionIndex) => {
        if (condition.type === 'message_contains_keywords') {
          const values = (condition.values || []).map((value) => value.trim()).filter(Boolean);

          if (!values.length) {
            throw new Error(`Add at least one keyword for filter ${conditionIndex + 1} in ${name}.`);
          }

          return {
            id: condition.id,
            type: condition.type,
            operator:
              condition.operator === 'equals' ||
              condition.operator === 'starts_with' ||
              condition.operator === 'ends_with' ||
              condition.operator === 'fuzzy'
                ? condition.operator
                : 'contains_any',
            values,
          };
        }

        if (condition.type === 'contact_attribute') {
          if (!condition.field?.trim() || !condition.value?.trim()) {
            throw new Error(`Add an attribute name and value for filter ${conditionIndex + 1} in ${name}.`);
          }

          return {
            id: condition.id,
            type: condition.type,
            operator:
              condition.operator === 'contains' || condition.operator === 'does_not_equal'
                ? condition.operator
                : 'equals',
            field: condition.field.trim(),
            value: condition.value.trim(),
          };
        }

        if (condition.type === 'timestamp') {
          if (!condition.startTime || !condition.endTime) {
            throw new Error(`Add start and end times for filter ${conditionIndex + 1} in ${name}.`);
          }

          return {
            id: condition.id,
            type: condition.type,
            operator: condition.operator === 'outside' ? 'outside' : 'between',
            startTime: condition.startTime,
            endTime: condition.endTime,
          };
        }

        return {
          id: condition.id,
          type: condition.type,
          operator: condition.operator,
        };
      }),
    };
    const firstKeywordCondition = normalizedFilters.conditions.find((condition) => condition.type === 'message_contains_keywords');
    const keyword = firstKeywordCondition?.values?.[0] || '*';
    const keywordMatchMode: AutomationRuleKeywordMatchMode =
      firstKeywordCondition?.operator === 'equals'
        ? 'equals'
        : firstKeywordCondition?.operator === 'starts_with' ||
            firstKeywordCondition?.operator === 'ends_with' ||
            firstKeywordCondition?.operator === 'fuzzy'
          ? firstKeywordCondition.operator
          : firstKeywordCondition
            ? 'contains'
            : 'any';

    if (rule.actionType === 'send_text') {
      const messageBody = rule.messageBody.trim();

      if (!messageBody) {
        throw new Error(`Add a response message for ${name}.`);
      }

      return {
        id: rule.id,
        name,
        isEnabled: rule.isEnabled,
        triggerType: rule.triggerType,
        keyword,
        keywordMatchMode,
        filters: normalizedFilters,
        action: {
          type: 'send_text',
          messageBody,
          filters: normalizedFilters,
        },
      };
    }

    if (rule.actionType === 'opt_out_marketing') {
      return {
        id: rule.id,
        name,
        isEnabled: rule.isEnabled,
        triggerType: rule.triggerType,
        keyword,
        keywordMatchMode,
        filters: normalizedFilters,
        action: {
          type: 'opt_out_marketing',
          filters: normalizedFilters,
        },
      };
    }

    if (rule.actionType === 'send_flow') {
      const flowBody = rule.flowBody.trim();
      const flowCta = rule.flowCta.trim() || 'Open Flow';

      if (!rule.flowId) {
        throw new Error(`Choose a Flow for ${name}.`);
      }

      if (!flowBody) {
        throw new Error(`Add a Flow message body for ${name}.`);
      }

      if (flowCta.length > 30) {
        throw new Error(`Flow CTA text for ${name} must be 30 characters or less.`);
      }

      return {
        id: rule.id,
        name,
        isEnabled: rule.isEnabled,
        triggerType: rule.triggerType,
        keyword,
        keywordMatchMode,
        filters: normalizedFilters,
        action: {
          type: 'send_flow',
          flowId: rule.flowId,
          flowCta,
          flowBody,
          flowHeader: rule.flowHeader.trim() || undefined,
          flowFooter: rule.flowFooter.trim() || undefined,
          flowMode: rule.flowMode,
          flowToken: rule.flowToken.trim() || undefined,
          flowAction: 'navigate',
          flowScreen: rule.flowScreen.trim() || undefined,
          filters: normalizedFilters,
        },
      };
    }

    if (!rule.templateName.trim() || !rule.templateLanguage.trim()) {
      throw new Error(`Choose a template for ${name}.`);
    }

    return {
      id: rule.id,
      name,
      isEnabled: rule.isEnabled,
      triggerType: rule.triggerType,
      keyword,
      keywordMatchMode,
      filters: normalizedFilters,
      action: {
        type: 'send_template',
        templateName: rule.templateName.trim(),
        templateLanguage: rule.templateLanguage.trim(),
        filters: normalizedFilters,
      },
    };
  });
}

function StatCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-gray-500">{title}</p>
          <p className="mt-1 truncate text-xl font-bold text-gray-900">{value}</p>
        </div>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#eef2ff] text-[#4338ca]">
          {icon}
        </div>
      </div>
    </div>
  );
}

function RulesSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-[72px] animate-pulse rounded-2xl border border-gray-200 bg-white" />
        ))}
      </div>
      <div className="h-[360px] animate-pulse rounded-3xl border border-gray-200 bg-white" />
    </div>
  );
}

function TriggerEditorModal({
  mode,
  draft,
  templates,
  flows,
  isFlowsLoading,
  isSaving,
  setDraft,
  onClose,
  onSubmit,
}: {
  mode: 'create' | 'edit';
  draft: RuleDraft;
  templates: MetaTemplate[];
  flows: WhatsAppFlow[];
  isFlowsLoading: boolean;
  isSaving: boolean;
  setDraft: (updater: (current: RuleDraft) => RuleDraft) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
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

  const selectedTemplateValue =
    draft.templateName && draft.templateLanguage ? `${draft.templateName}::${draft.templateLanguage}` : '';
  const selectedFlow = flows.find((flow) => flow.id === draft.flowId) || null;
  const updateCondition = (
    conditionIndex: number,
    updater: (condition: AutomationRuleFilterCondition) => AutomationRuleFilterCondition,
  ) => {
    setDraft((current) => ({
      ...current,
      filters: {
        ...current.filters,
        conditions: current.filters.conditions.map((condition, index) =>
          index === conditionIndex ? updater(condition) : condition,
        ),
      },
    }));
  };
  const addCondition = () => {
    setDraft((current) => ({
      ...current,
      filters: {
        ...current.filters,
        conditions: [...current.filters.conditions, createFilterCondition()],
      },
    }));
  };
  const removeCondition = (conditionIndex: number) => {
    setDraft((current) => ({
      ...current,
      filters: {
        ...current.filters,
        conditions: current.filters.conditions.filter((_, index) => index !== conditionIndex),
      },
    }));
  };

  return createPortal(
    <div className="fixed inset-0 z-[130] overflow-y-auto">
      <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm" />
      <div className="relative flex min-h-full items-center justify-center px-4 py-6">
        <div
          role="dialog"
          aria-modal="true"
          className="flex max-h-[calc(100dvh-3rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-white/40 bg-white shadow-2xl"
        >
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{mode === 'create' ? 'Create Trigger' : 'Edit Trigger'}</h2>
            <p className="mt-1 text-sm text-gray-500">Configure the trigger, filter, and action layers.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
            aria-label="Close trigger editor"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          <div className="space-y-7">
            <section>
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-2xl bg-[#eef2ff] text-sm font-bold text-[#4338ca]">1</span>
                <h3 className="text-lg font-semibold text-gray-900">Trigger</h3>
              </div>
              <div className="grid gap-5 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-gray-700">Trigger Name</span>
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Pricing reply"
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                  />
                </label>
                <div className="block">
                  <span className="mb-2 block text-sm font-medium text-gray-700">Trigger Type</span>
                  <DropdownSelect
                    value={draft.triggerType}
                    onChange={(nextTriggerType) =>
                      setDraft((current) => ({
                        ...current,
                        triggerType: nextTriggerType as EditableTriggerType,
                      }))
                    }
                    options={TRIGGER_OPTIONS}
                    ariaLabel="Select automation trigger type"
                    buttonClassName="rounded-2xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#5b45ff] focus:ring-[#5b45ff]/15"
                  />
                </div>
              </div>
            </section>

            <section className="border-t border-gray-100 pt-6">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-2xl bg-[#eef2ff] text-sm font-bold text-[#4338ca]">2</span>
                <h3 className="text-lg font-semibold text-gray-900">Filter</h3>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="block sm:w-56">
                    <span className="mb-2 block text-sm font-medium text-gray-700">Logic</span>
                    <DropdownSelect
                      value={draft.filters.operator}
                      onChange={(nextOperator) =>
                        setDraft((current) => ({
                          ...current,
                          filters: {
                            ...current.filters,
                            operator: nextOperator === 'OR' ? 'OR' : 'AND',
                          },
                        }))
                      }
                      options={[
                        { value: 'AND', label: 'All filters match' },
                        { value: 'OR', label: 'Any filter matches' },
                      ]}
                      ariaLabel="Select filter logic"
                      buttonClassName="rounded-2xl border-gray-200 bg-white px-4 py-3 focus:border-[#5b45ff] focus:ring-[#5b45ff]/15"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={addCondition}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
                  >
                    <Plus className="h-4 w-4" />
                    Add Filter
                  </button>
                </div>

                <div className="mt-4 space-y-4">
                  {draft.filters.conditions.map((condition, conditionIndex) => (
                    <div key={condition.id || conditionIndex} className="rounded-2xl border border-gray-200 bg-white p-4">
                      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
                        <div className="block">
                          <span className="mb-2 block text-sm font-medium text-gray-700">Filter Type</span>
                          <DropdownSelect
                            value={condition.type}
                            onChange={(nextValue) => {
                              const nextType = nextValue as AutomationRuleFilterType;
                              updateCondition(conditionIndex, () => createFilterCondition(nextType));
                            }}
                            options={FILTER_TYPE_OPTIONS}
                            ariaLabel="Select automation filter type"
                            buttonClassName="rounded-2xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#5b45ff] focus:ring-[#5b45ff]/15"
                          />
                        </div>
                        <div className="block">
                          <span className="mb-2 block text-sm font-medium text-gray-700">Operator</span>
                          {condition.type === 'timestamp' ? (
                            <DropdownSelect
                              value={condition.operator}
                              onChange={(nextOperator) =>
                                updateCondition(conditionIndex, (current) => ({
                                  ...current,
                                  operator: nextOperator as AutomationRuleFilterOperator,
                                }))
                              }
                              options={[
                                { value: 'between', label: 'Between' },
                                { value: 'outside', label: 'Outside' },
                              ]}
                              ariaLabel="Select timestamp filter operator"
                              buttonClassName="rounded-2xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#5b45ff] focus:ring-[#5b45ff]/15"
                            />
                          ) : condition.type === 'contact_attribute' ? (
                            <DropdownSelect
                              value={condition.operator}
                              onChange={(nextOperator) =>
                                updateCondition(conditionIndex, (current) => ({
                                  ...current,
                                  operator: nextOperator as AutomationRuleFilterOperator,
                                }))
                              }
                              options={[
                                { value: 'equals', label: 'Equals' },
                                { value: 'contains', label: 'Contains' },
                                { value: 'does_not_equal', label: 'Does not equal' },
                              ]}
                              ariaLabel="Select contact attribute filter operator"
                              buttonClassName="rounded-2xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#5b45ff] focus:ring-[#5b45ff]/15"
                            />
                          ) : condition.type === 'contact_exists' ? (
                            <DropdownSelect
                              value={condition.operator}
                              onChange={(nextOperator) =>
                                updateCondition(conditionIndex, (current) => ({
                                  ...current,
                                  operator: nextOperator as AutomationRuleFilterOperator,
                                }))
                              }
                              options={[
                                { value: 'is_true', label: 'Exists' },
                                { value: 'is_false', label: 'Does not exist' },
                              ]}
                              ariaLabel="Select contact existence filter operator"
                              buttonClassName="rounded-2xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#5b45ff] focus:ring-[#5b45ff]/15"
                            />
                          ) : condition.type === 'message_contains_keywords' ? (
                            <DropdownSelect
                              value={condition.operator}
                              onChange={(nextOperator) =>
                                updateCondition(conditionIndex, (current) => ({
                                  ...current,
                                  operator: nextOperator as AutomationRuleFilterOperator,
                                }))
                              }
                              options={[
                                { value: 'contains_any', label: 'Contains any' },
                                { value: 'equals', label: 'Equals' },
                                { value: 'starts_with', label: 'Starts with' },
                                { value: 'ends_with', label: 'Ends with' },
                                { value: 'fuzzy', label: 'Fuzzy match' },
                              ]}
                              ariaLabel="Select keyword filter operator"
                              buttonClassName="rounded-2xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#5b45ff] focus:ring-[#5b45ff]/15"
                            />
                          ) : (
                            <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">Boolean</div>
                          )}
                        </div>
                      </div>

                      {condition.type === 'message_contains_keywords' ? (
                        <label className="mt-4 block">
                          <span className="mb-2 block text-sm font-medium text-gray-700">Keywords</span>
                          <input
                            type="text"
                            value={(condition.values || []).join(', ')}
                            onChange={(event) =>
                              updateCondition(conditionIndex, (current) => ({
                                ...current,
                                values: event.target.value.split(',').map((value) => value.trim()),
                              }))
                            }
                            placeholder="pricing, help, order"
                            className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                          />
                        </label>
                      ) : null}

                      {condition.type === 'timestamp' ? (
                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                          <label className="block">
                            <span className="mb-2 block text-sm font-medium text-gray-700">Start Time</span>
                            <input
                              type="time"
                              value={condition.startTime || '09:00'}
                              onChange={(event) =>
                                updateCondition(conditionIndex, (current) => ({
                                  ...current,
                                  startTime: event.target.value,
                                }))
                              }
                              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-2 block text-sm font-medium text-gray-700">End Time</span>
                            <input
                              type="time"
                              value={condition.endTime || '18:00'}
                              onChange={(event) =>
                                updateCondition(conditionIndex, (current) => ({
                                  ...current,
                                  endTime: event.target.value,
                                }))
                              }
                              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                            />
                          </label>
                        </div>
                      ) : null}

                      {condition.type === 'contact_attribute' ? (
                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                          <label className="block">
                            <span className="mb-2 block text-sm font-medium text-gray-700">Attribute</span>
                            <input
                              type="text"
                              value={condition.field || ''}
                              onChange={(event) =>
                                updateCondition(conditionIndex, (current) => ({
                                  ...current,
                                  field: event.target.value,
                                }))
                              }
                              placeholder="source, status, tags"
                              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-2 block text-sm font-medium text-gray-700">Value</span>
                            <input
                              type="text"
                              value={condition.value || ''}
                              onChange={(event) =>
                                updateCondition(conditionIndex, (current) => ({
                                  ...current,
                                  value: event.target.value,
                                }))
                              }
                              placeholder="vip"
                              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                            />
                          </label>
                        </div>
                      ) : null}

                      <div className="mt-4 flex items-center justify-between gap-3">
                        <p className="text-xs text-gray-500">{getConditionSummary(condition)}</p>
                        <button
                          type="button"
                          onClick={() => removeCondition(conditionIndex)}
                          className="inline-flex items-center gap-1 rounded-xl border border-rose-100 bg-white px-3 py-2 text-xs font-medium text-rose-600 transition hover:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="border-t border-gray-100 pt-6">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-2xl bg-[#eef2ff] text-sm font-bold text-[#4338ca]">3</span>
                <h3 className="text-lg font-semibold text-gray-900">Action</h3>
              </div>
              <div className="grid gap-5">
                <div className="block md:max-w-xs">
                  <span className="mb-2 block text-sm font-medium text-gray-700">Trigger Action</span>
                  <DropdownSelect
                    value={draft.actionType}
                    onChange={(nextActionType) =>
                      setDraft((current) => ({
                        ...current,
                        actionType: nextActionType as AutomationRuleActionType,
                      }))
                    }
                    options={[
                      { value: 'send_text', label: 'Send message' },
                      { value: 'send_template', label: 'Send template' },
                      { value: 'send_flow', label: 'Send Flow' },
                      { value: 'opt_out_marketing', label: 'Opt out of marketing' },
                    ]}
                    ariaLabel="Select automation action"
                    buttonClassName="rounded-2xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#5b45ff] focus:ring-[#5b45ff]/15"
                  />
                </div>

                {draft.actionType === 'send_text' ? (
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-gray-700">Response Message</span>
                    <textarea
                      rows={5}
                      value={draft.messageBody}
                      onChange={(event) => setDraft((current) => ({ ...current, messageBody: event.target.value }))}
                      placeholder="Thanks for reaching out. Here are the details..."
                      className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                    />
                  </label>
                ) : draft.actionType === 'opt_out_marketing' ? (
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">
                    When this trigger matches, the contact will be opted out of WhatsApp marketing campaigns automatically.
                    Marketing template sends and campaign sends will be blocked for that contact.
                  </div>
                ) : draft.actionType === 'send_flow' ? (
                  <div className="space-y-5">
                    <div className="grid gap-5 md:grid-cols-2">
                      <div className="block">
                        <span className="mb-2 block text-sm font-medium text-gray-700">Flow</span>
                        <DropdownSelect
                          value={draft.flowId}
                          onChange={(nextFlowId) => {
                            const flow = flows.find((item) => item.id === nextFlowId) || null;
                            setDraft((current) => ({
                              ...current,
                              flowId: flow?.id || '',
                              flowMode: flow?.status === 'DRAFT' ? 'draft' : 'published',
                              flowScreen: getFlowEntryScreen(flow),
                              flowCta: current.flowCta || 'Open Flow',
                              flowBody: current.flowBody || `Please complete ${flow?.name || 'this form'}.`,
                            }));
                          }}
                          disabled={isFlowsLoading}
                          options={[
                            { value: '', label: isFlowsLoading ? 'Loading Flows...' : 'Select Flow' },
                            ...flows.map((flow) => ({
                              value: flow.id,
                              label: getFlowOptionLabel(flow),
                            })),
                          ]}
                          placeholder={isFlowsLoading ? 'Loading Flows...' : 'Select Flow'}
                          ariaLabel="Select automation Flow"
                          buttonClassName="rounded-2xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#5b45ff] focus:ring-[#5b45ff]/15 disabled:opacity-60"
                        />
                        {!isFlowsLoading && !flows.length ? (
                          <p className="mt-2 text-sm text-gray-500">
                            No Flows available.{' '}
                            <Link to="/dashboard/automations/flows" className="font-medium text-[#5b45ff]">
                              Create Flow
                            </Link>
                          </p>
                        ) : null}
                      </div>
                      <div className="block">
                        <span className="mb-2 block text-sm font-medium text-gray-700">Mode</span>
                        <DropdownSelect
                          value={draft.flowMode}
                          onChange={(nextFlowMode) =>
                            setDraft((current) => ({
                              ...current,
                              flowMode: nextFlowMode === 'draft' ? 'draft' : 'published',
                            }))
                          }
                          options={[
                            { value: 'published', label: 'Published' },
                            { value: 'draft', label: 'Draft' },
                          ]}
                          ariaLabel="Select Flow mode"
                          buttonClassName="rounded-2xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#5b45ff] focus:ring-[#5b45ff]/15"
                        />
                        {selectedFlow?.status === 'DRAFT' ? (
                          <p className="mt-2 text-xs text-amber-600">This Flow is still a draft.</p>
                        ) : null}
                      </div>
                    </div>
                    <div className="grid gap-5 md:grid-cols-2">
                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-gray-700">CTA Button Text</span>
                        <input
                          type="text"
                          value={draft.flowCta}
                          onChange={(event) => setDraft((current) => ({ ...current, flowCta: event.target.value }))}
                          maxLength={30}
                          placeholder="Book Now"
                          className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-gray-700">Entry Screen</span>
                        <input
                          type="text"
                          value={draft.flowScreen}
                          onChange={(event) => setDraft((current) => ({ ...current, flowScreen: event.target.value }))}
                          placeholder="FIRST_ENTRY_SCREEN"
                          className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                        />
                      </label>
                    </div>
                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-gray-700">Message Body</span>
                      <textarea
                        rows={4}
                        value={draft.flowBody}
                        onChange={(event) => setDraft((current) => ({ ...current, flowBody: event.target.value }))}
                        placeholder="Please complete this form."
                        className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                      />
                    </label>
                    <div className="grid gap-5 md:grid-cols-2">
                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-gray-700">Header</span>
                        <input
                          type="text"
                          value={draft.flowHeader}
                          onChange={(event) => setDraft((current) => ({ ...current, flowHeader: event.target.value }))}
                          placeholder="Quick form"
                          className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-gray-700">Footer</span>
                        <input
                          type="text"
                          value={draft.flowFooter}
                          onChange={(event) => setDraft((current) => ({ ...current, flowFooter: event.target.value }))}
                          placeholder="Sent via Connektly"
                          className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                        />
                      </label>
                    </div>
                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-gray-700">Flow Token</span>
                      <input
                        type="text"
                        value={draft.flowToken}
                        onChange={(event) => setDraft((current) => ({ ...current, flowToken: event.target.value }))}
                        placeholder="Optional identifier"
                        className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                      />
                    </label>
                  </div>
                ) : (
                  <div>
                    <div className="block">
                      <span className="mb-2 block text-sm font-medium text-gray-700">Template</span>
                      <DropdownSelect
                        value={selectedTemplateValue}
                        onChange={(nextTemplateValue) => {
                          const template = templates.find((item) => getTemplateOptionValue(item) === nextTemplateValue);
                          setDraft((current) => ({
                            ...current,
                            templateName: template?.name || '',
                            templateLanguage: template?.language || '',
                          }));
                        }}
                        options={[
                          { value: '', label: 'Select template' },
                          ...templates.map((template) => ({
                            value: getTemplateOptionValue(template),
                            label: `${template.name} (${template.language})`,
                          })),
                        ]}
                        placeholder="Select template"
                        ariaLabel="Select automation template"
                        buttonClassName="rounded-2xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#5b45ff] focus:ring-[#5b45ff]/15"
                      />
                    </div>
                    {!templates.length ? (
                      <p className="mt-2 text-sm text-gray-500">
                        No approved templates available.{' '}
                        <Link to="/dashboard/templates" className="font-medium text-[#5b45ff]">
                          Open Templates
                        </Link>
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
            </section>
          </div>

          <div className="mt-7 flex justify-end gap-3 border-t border-gray-100 pt-5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-2xl bg-[#5b45ff] px-4 py-3 text-sm font-medium text-white shadow-lg shadow-[#5b45ff]/25 transition hover:bg-[#4a35e8] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {mode === 'create' ? 'Create Trigger' : 'Save Trigger'}
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>,
    document.body,
  );
}

export default function Automations() {
  const { bootstrap } = useAppData();
  const channel = bootstrap?.channel || null;
  const templates = useMemo(
    () => sortMetaTemplates((bootstrap?.templates || []).filter(isSendableTemplate)),
    [bootstrap?.templates],
  );
  const [flows, setFlows] = useState<WhatsAppFlow[]>([]);
  const [isFlowsLoading, setIsFlowsLoading] = useState(false);
  const [rules, setRules] = useState<RuleDraft[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | null>(null);
  const [editorDraft, setEditorDraft] = useState<RuleDraft | null>(null);

  const activeRuleCount = rules.filter((rule) => rule.isEnabled).length;
  const totalExecutions = rules.reduce((total, rule) => total + rule.triggerCount, 0);
  const lastTriggeredAt =
    rules
      .map((rule) => rule.lastTriggeredAt)
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => Date.parse(right) - Date.parse(left))[0] || null;

  const loadRules = async () => {
    if (!channel) {
      setRules([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      setSuccess(null);
      const response = await appApi.getAutomationRules();
      setRules(response.rules.map((rule) => createRuleDraft(rule)));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load triggers.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadFlows = async () => {
    if (!channel) {
      setFlows([]);
      setIsFlowsLoading(false);
      return;
    }

    try {
      setIsFlowsLoading(true);
      const response = await appApi.getFlows();
      setFlows(response.flows.filter((flow) => Boolean(flow.metaFlowId)));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load Flows.');
    } finally {
      setIsFlowsLoading(false);
    }
  };

  useEffect(() => {
    void loadRules();
    void loadFlows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel?.id]);

  const persistRules = async (nextRules: RuleDraft[], message: string) => {
    if (!channel) {
      setError('Connect a WhatsApp Business number before saving triggers.');
      return false;
    }

    try {
      setIsSaving(true);
      setError(null);
      setSuccess(null);
      const response = await appApi.updateAutomationRules({ rules: buildRulePayload(nextRules) });
      setRules(response.rules.map((rule) => createRuleDraft(rule)));
      setSuccess(message);
      return true;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to save triggers.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const openCreateEditor = () => {
    setEditorMode('create');
    setEditorDraft(createRuleDraft());
    setError(null);
    setSuccess(null);
  };

  const openEditEditor = (rule: RuleDraft) => {
    setEditorMode('edit');
    setEditorDraft({ ...rule });
    setError(null);
    setSuccess(null);
  };

  const closeEditor = () => {
    if (isSaving) {
      return;
    }

    setEditorMode(null);
    setEditorDraft(null);
  };

  const handleSubmitEditor = async () => {
    if (!editorDraft || !editorMode) {
      return;
    }

    const nextRules =
      editorMode === 'create'
        ? [editorDraft, ...rules]
        : rules.map((rule) => (rule.clientId === editorDraft.clientId ? editorDraft : rule));
    const saved = await persistRules(nextRules, editorMode === 'create' ? 'Trigger created.' : 'Trigger updated.');

    if (saved) {
      setEditorMode(null);
      setEditorDraft(null);
    }
  };

  const handleToggleStatus = async (rule: RuleDraft) => {
    const nextRules = rules.map((item) =>
      item.clientId === rule.clientId ? { ...item, isEnabled: !item.isEnabled } : item,
    );
    await persistRules(nextRules, 'Trigger status updated.');
  };

  const handleDuplicateRule = async (rule: RuleDraft) => {
    const duplicate: RuleDraft = {
      ...rule,
      clientId: createClientId(),
      id: undefined,
      name: `${getRuleTitle(rule)} Copy`.slice(0, 90),
      isEnabled: false,
      lastTriggeredAt: null,
      triggerCount: 0,
      lastError: null,
    };

    await persistRules([duplicate, ...rules], 'Trigger duplicated.');
  };

  const handleDeleteRule = async (rule: RuleDraft) => {
    await persistRules(rules.filter((item) => item.clientId !== rule.clientId), 'Trigger deleted.');
  };

  if (!channel) {
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-3xl border border-gray-200 bg-white px-6 py-8 shadow-sm sm:px-8 sm:py-10">
          <div className="max-w-3xl">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#eef2ff] text-[#4338ca]">
              <Zap className="h-6 w-6" />
            </div>
            <h1 className="mt-5 text-2xl font-bold text-gray-900">Triggers</h1>
            <p className="mt-1 text-sm text-gray-500">
              Connect a WhatsApp Business number before creating automation triggers.
            </p>
            <div className="mt-6">
              <Link
                to="/dashboard/channels"
                className="inline-flex items-center gap-2 rounded-2xl bg-[#5b45ff] px-4 py-3 text-sm font-medium text-white shadow-lg shadow-[#5b45ff]/25 transition hover:bg-[#4a35e8]"
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
          <h1 className="text-2xl font-bold text-gray-900">Triggers</h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-500">
            Automate workflows with a trigger, filter, and action.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              void loadRules();
              void loadFlows();
            }}
            disabled={isLoading || isSaving}
            className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            Refresh
          </button>
          <button
            type="button"
            onClick={openCreateEditor}
            disabled={isLoading || isSaving}
            className="inline-flex items-center gap-2 rounded-2xl bg-[#5b45ff] px-4 py-3 text-sm font-medium text-white shadow-lg shadow-[#5b45ff]/25 transition hover:bg-[#4a35e8] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            Create Trigger
          </button>
        </div>
      </div>

      {error ? (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {success ? (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <span>{success}</span>
        </div>
      ) : null}

      {isLoading ? (
        <RulesSkeleton />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <StatCard
              title="Active triggers"
              value={`${activeRuleCount}/${rules.length}`}
              icon={<Zap className="h-4 w-4" />}
            />
            <StatCard
              title="Total executed"
              value={String(totalExecutions)}
              icon={<MessageSquareText className="h-4 w-4" />}
            />
            <StatCard
              title="Last execution"
              value={formatDateTime(lastTriggeredAt)}
              icon={<FileText className="h-4 w-4" />}
            />
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            {rules.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1040px] table-fixed divide-y divide-gray-200">
                  <colgroup>
                    <col className="w-[31%]" />
                    <col className="w-[17%]" />
                    <col className="w-[16%]" />
                    <col className="w-[10%]" />
                    <col className="w-[15%]" />
                    <col className="w-[11%]" />
                  </colgroup>
                  <thead className="bg-gray-50">
                    <tr>
                      {['Trigger Name', 'Trigger Type', 'Trigger Action', 'Status', 'Executed'].map((label) => (
                        <th key={label} className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                          {label}
                        </th>
                      ))}
                      <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rules.map((rule, index) => (
                      <tr key={rule.clientId} className="align-middle transition-colors hover:bg-gray-50">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#5b45ff]/10 text-[#5b45ff]">
                              <Zap className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-gray-900">{getRuleTitle(rule, index)}</p>
                              <p className="mt-1 truncate text-xs text-gray-500">{getFilterSummary(rule)}</p>
                              {rule.lastError ? <p className="mt-1 max-w-sm truncate text-xs text-rose-600">{rule.lastError}</p> : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <span
                            title={getTriggerLabel(rule.triggerType)}
                            className="inline-block max-w-full truncate rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium leading-5 text-gray-700"
                          >
                            {getTriggerLabel(rule.triggerType)}
                          </span>
                        </td>
                        <td className="truncate px-5 py-3 text-sm text-gray-700">{getActionSummary(rule)}</td>
                        <td className="px-5 py-3">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={rule.isEnabled}
                            aria-label={`${rule.isEnabled ? 'Disable' : 'Enable'} ${getRuleTitle(rule, index)}`}
                            title={rule.isEnabled ? 'On' : 'Off'}
                            onClick={() => void handleToggleStatus(rule)}
                            disabled={isSaving}
                            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b45ff]/30 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
                              rule.isEnabled
                                ? 'border-emerald-400 bg-emerald-500'
                                : 'border-gray-300 bg-gray-200'
                            }`}
                          >
                            <span
                              className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                                rule.isEnabled ? 'translate-x-5' : 'translate-x-0.5'
                              }`}
                            />
                          </button>
                        </td>
                        <td className="px-5 py-3">
                          <p className="text-sm font-semibold text-gray-900">{rule.triggerCount}</p>
                          <p className="mt-1 truncate text-xs text-gray-500">{formatDateTime(rule.lastTriggeredAt)}</p>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => void handleDuplicateRule(rule)}
                              disabled={isSaving}
                              title="Duplicate"
                              aria-label={`Duplicate ${getRuleTitle(rule, index)}`}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <Copy className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditEditor(rule)}
                              disabled={isSaving}
                              title="Edit"
                              aria-label={`Edit ${getRuleTitle(rule, index)}`}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteRule(rule)}
                              disabled={isSaving}
                              title="Delete"
                              aria-label={`Delete ${getRuleTitle(rule, index)}`}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-rose-100 bg-white text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-6 py-16 text-center">
                <MessageSquareText className="mx-auto h-10 w-10 text-gray-300" />
                <h2 className="mt-4 text-lg font-semibold text-gray-900">No triggers to show</h2>
                <p className="mx-auto mt-2 max-w-xl text-sm text-gray-500">
                  Create a trigger to start automating message responses and contact workflows.
                </p>
                <button
                  type="button"
                  onClick={openCreateEditor}
                  className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-[#5b45ff] px-4 py-3 text-sm font-medium text-white shadow-lg shadow-[#5b45ff]/25 transition hover:bg-[#4a35e8]"
                >
                  <Plus className="h-4 w-4" />
                  Create Trigger
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {editorMode && editorDraft ? (
        <TriggerEditorModal
          mode={editorMode}
          draft={editorDraft}
          templates={templates}
          flows={flows}
          isFlowsLoading={isFlowsLoading}
          isSaving={isSaving}
          setDraft={(updater) => setEditorDraft((current) => (current ? updater(current) : current))}
          onClose={closeEditor}
          onSubmit={() => void handleSubmitEditor()}
        />
      ) : null}
    </div>
  );
}
