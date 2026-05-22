import type {
  AutomationRule,
  AutomationRuleAction,
  AutomationRuleFilterCondition,
  AutomationRuleFilterGroup,
  AutomationRuleFilterOperator,
  AutomationRuleInput,
  AutomationRuleKeywordMatchMode,
  AutomationRuleTriggerType,
} from './types';

export type VisualNodeKind = 'trigger' | 'condition' | 'action';

export type VisualTriggerType = AutomationRuleTriggerType | 'webhook_event_received';

export type VisualConditionType =
  | 'keyword_rule'
  | 'contact_attribute'
  | 'lead_status'
  | 'message_type'
  | 'contact_initiates_chat'
  | 'timestamp'
  | 'contact_exists'
  | 'no_keyword_matches';

export type VisualKeywordMatchMethod = 'equals' | 'contains' | 'starts_with' | 'ends_with' | 'fuzzy';
export type VisualAttributeOperator = 'equals' | 'contains' | 'does_not_equal';
export type VisualActionType =
  | 'send_template_message'
  | 'send_custom_message'
  | 'send_flow'
  | 'opt_out_marketing'
  | 'update_contact_attribute'
  | 'update_lead_status'
  | 'add_tag'
  | 'trigger_webhook'
  | 'notify_team_member';

export interface VisualNodeOption<TValue extends string> {
  value: TValue;
  label: string;
  description: string;
  isLiveSupported: boolean;
}

export interface VisualTriggerConfig {
  triggerType: VisualTriggerType;
}

export interface VisualConditionConfig {
  conditionType: VisualConditionType;
  keyword: string;
  matchMethod: VisualKeywordMatchMethod;
  attributeName: string;
  attributeOperator: VisualAttributeOperator;
  attributeValue: string;
  leadStatus: string;
  messageType: 'text' | 'image' | 'button_reply';
  startTime: string;
  endTime: string;
  booleanOperator: 'is_true' | 'is_false';
}

export interface VisualActionConfig {
  actionType: VisualActionType;
  messageBody: string;
  templateName: string;
  templateLanguage: string;
  flowId: string;
  flowCta: string;
  flowBody: string;
  attributeName: string;
  attributeValue: string;
  leadStatus: string;
  tag: string;
  webhookUrl: string;
  teamMember: string;
}

export type VisualNodeConfig = VisualTriggerConfig | VisualConditionConfig | VisualActionConfig;

export interface VisualAutomationNode {
  id: string;
  kind: VisualNodeKind;
  x: number;
  y: number;
  config: VisualNodeConfig;
}

export interface VisualAutomationDraft {
  clientId: string;
  id?: string;
  name: string;
  isEnabled: boolean;
  nodes: VisualAutomationNode[];
  createdAt?: string;
  updatedAt?: string;
  triggerCount?: number;
}

export const VISUAL_TRIGGER_OPTIONS: Array<VisualNodeOption<VisualTriggerType>> = [
  {
    value: 'whatsapp_message_received',
    label: 'New WhatsApp Message Received',
    description: 'Starts when an inbound WhatsApp message reaches the inbox.',
    isLiveSupported: true,
  },
  {
    value: 'lead_created',
    label: 'New Lead Created',
    description: 'Starts when a new lead is added to the workspace.',
    isLiveSupported: true,
  },
  {
    value: 'contact_attribute_changed',
    label: 'Contact Updated',
    description: 'Starts when a contact attribute changes.',
    isLiveSupported: true,
  },
  {
    value: 'instagram_message_received',
    label: 'New Instagram Message Received',
    description: 'Starts when Instagram receives an inbound message.',
    isLiveSupported: true,
  },
  {
    value: 'webhook_event_received',
    label: 'Webhook Event Received',
    description: 'Reserved for external webhook events.',
    isLiveSupported: false,
  },
];

export const VISUAL_CONDITION_OPTIONS: Array<VisualNodeOption<VisualConditionType>> = [
  {
    value: 'keyword_rule',
    label: 'Incoming Message Matches Keyword Rule',
    description: 'Checks inbound text against a keyword rule.',
    isLiveSupported: true,
  },
  {
    value: 'contact_attribute',
    label: 'Contact Attribute Rule',
    description: 'Compares a contact attribute with a target value.',
    isLiveSupported: true,
  },
  {
    value: 'lead_status',
    label: 'Lead Status Is',
    description: 'Checks the contact lead status.',
    isLiveSupported: true,
  },
  {
    value: 'message_type',
    label: 'Message Type Is',
    description: 'Reserved for text, image, and button reply routing.',
    isLiveSupported: false,
  },
  {
    value: 'contact_initiates_chat',
    label: 'Contact Initiates Chat',
    description: 'Checks whether this is a new conversation.',
    isLiveSupported: true,
  },
  {
    value: 'timestamp',
    label: 'Timestamp Window',
    description: 'Checks whether the event time falls inside a time window.',
    isLiveSupported: true,
  },
  {
    value: 'contact_exists',
    label: 'Contact Exists',
    description: 'Checks whether the sender already has a contact record.',
    isLiveSupported: true,
  },
  {
    value: 'no_keyword_matches',
    label: 'No Keyword Matches',
    description: 'Continues when no other keyword rule matched.',
    isLiveSupported: true,
  },
];

export const VISUAL_ACTION_OPTIONS: Array<VisualNodeOption<VisualActionType>> = [
  {
    value: 'send_template_message',
    label: 'Send Template Message',
    description: 'Sends an approved WhatsApp template.',
    isLiveSupported: true,
  },
  {
    value: 'send_custom_message',
    label: 'Send Custom Message',
    description: 'Sends a plain text message.',
    isLiveSupported: true,
  },
  {
    value: 'send_flow',
    label: 'Send WhatsApp Flow',
    description: 'Launches a published WhatsApp Flow from chat.',
    isLiveSupported: true,
  },
  {
    value: 'opt_out_marketing',
    label: 'Opt Out of Marketing',
    description: 'Turns off WhatsApp marketing campaign eligibility for the contact.',
    isLiveSupported: true,
  },
  {
    value: 'update_contact_attribute',
    label: 'Update Contact Attribute',
    description: 'Reserved for CRM attribute updates.',
    isLiveSupported: false,
  },
  {
    value: 'update_lead_status',
    label: 'Update Lead Status',
    description: 'Reserved for lead pipeline updates.',
    isLiveSupported: false,
  },
  {
    value: 'add_tag',
    label: 'Add Tag / Label',
    description: 'Reserved for contact labeling.',
    isLiveSupported: false,
  },
  {
    value: 'trigger_webhook',
    label: 'Trigger Webhook',
    description: 'Reserved for outbound webhook calls.',
    isLiveSupported: false,
  },
  {
    value: 'notify_team_member',
    label: 'Notify Team Member',
    description: 'Reserved for team notifications.',
    isLiveSupported: false,
  },
];

export const KEYWORD_MATCH_OPTIONS: Array<{ value: VisualKeywordMatchMethod; label: string }> = [
  { value: 'equals', label: 'Exact Match' },
  { value: 'contains', label: 'Contains' },
  { value: 'starts_with', label: 'Starts With' },
  { value: 'ends_with', label: 'Ends With' },
  { value: 'fuzzy', label: 'Fuzzy Match' },
];

export const ATTRIBUTE_OPERATOR_OPTIONS: Array<{ value: VisualAttributeOperator; label: string }> = [
  { value: 'equals', label: 'Equals' },
  { value: 'contains', label: 'Contains' },
  { value: 'does_not_equal', label: 'Does Not Equal' },
];

export function createVisualClientId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
}

export function formatAutomationDateTime(value: string | null | undefined) {
  if (!value) {
    return 'Not available';
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Not available' : parsed.toLocaleString();
}

export function getVisualTriggerLabel(value: VisualTriggerType | AutomationRuleTriggerType) {
  return VISUAL_TRIGGER_OPTIONS.find((option) => option.value === value)?.label || 'New WhatsApp Message Received';
}

export function getVisualConditionLabel(value: VisualConditionType) {
  return VISUAL_CONDITION_OPTIONS.find((option) => option.value === value)?.label || 'Condition';
}

export function getVisualActionLabel(value: VisualActionType) {
  return VISUAL_ACTION_OPTIONS.find((option) => option.value === value)?.label || 'Action';
}

export function isLiveSupportedTrigger(value: VisualTriggerType) {
  return Boolean(VISUAL_TRIGGER_OPTIONS.find((option) => option.value === value)?.isLiveSupported);
}

export function isLiveSupportedCondition(value: VisualConditionType) {
  return Boolean(VISUAL_CONDITION_OPTIONS.find((option) => option.value === value)?.isLiveSupported);
}

export function isLiveSupportedAction(value: VisualActionType) {
  return Boolean(VISUAL_ACTION_OPTIONS.find((option) => option.value === value)?.isLiveSupported);
}

export function getAutomationRuleTitle(rule: AutomationRule, index?: number) {
  return rule.name.trim() || (typeof index === 'number' ? `Automation ${index + 1}` : 'Untitled automation');
}

export function getDraftTitle(draft: VisualAutomationDraft) {
  return draft.name.trim() || 'Untitled automation';
}

function createTriggerConfig(rule?: AutomationRule): VisualTriggerConfig {
  return {
    triggerType: rule?.triggerType || 'whatsapp_message_received',
  };
}

function createConditionConfig(condition?: AutomationRuleFilterCondition): VisualConditionConfig {
  if (!condition) {
    return {
      conditionType: 'keyword_rule',
      keyword: 'help',
      matchMethod: 'contains',
      attributeName: '',
      attributeOperator: 'equals',
      attributeValue: '',
      leadStatus: 'New Lead',
      messageType: 'text',
      startTime: '09:00',
      endTime: '18:00',
      booleanOperator: 'is_true',
    };
  }

  if (condition.type === 'message_contains_keywords') {
    return {
      ...createConditionConfig(),
      conditionType: 'keyword_rule',
      keyword: (condition.values || []).join(', '),
      matchMethod: getVisualKeywordMatchMethod(condition.operator),
    };
  }

  if (condition.type === 'contact_attribute') {
    const field = condition.field || '';

    return {
      ...createConditionConfig(),
      conditionType: field === 'status' ? 'lead_status' : 'contact_attribute',
      attributeName: field,
      attributeOperator: getVisualAttributeOperator(condition.operator),
      attributeValue: condition.value || '',
      leadStatus: field === 'status' ? condition.value || 'New Lead' : 'New Lead',
    };
  }

  if (condition.type === 'timestamp') {
    return {
      ...createConditionConfig(),
      conditionType: 'timestamp',
      startTime: condition.startTime || '09:00',
      endTime: condition.endTime || '18:00',
      booleanOperator: condition.operator === 'outside' ? 'is_false' : 'is_true',
    };
  }

  if (
    condition.type === 'contact_initiates_chat' ||
    condition.type === 'contact_exists' ||
    condition.type === 'no_keyword_matches'
  ) {
    return {
      ...createConditionConfig(),
      conditionType: condition.type,
      booleanOperator: condition.operator === 'is_false' ? 'is_false' : 'is_true',
    };
  }

  return createConditionConfig();
}

function createActionConfig(action?: AutomationRuleAction): VisualActionConfig {
  if (action?.type === 'send_template') {
    return {
      ...createActionConfig(),
      actionType: 'send_template_message',
      templateName: action.templateName || '',
      templateLanguage: action.templateLanguage || '',
    };
  }

  if (action?.type === 'send_flow') {
    return {
      ...createActionConfig(),
      actionType: 'send_flow',
      flowId: action.flowId || '',
      flowCta: action.flowCta || 'Open Flow',
      flowBody: action.flowBody || 'Please complete this form.',
    };
  }

  if (action?.type === 'opt_out_marketing') {
    return {
      ...createActionConfig(),
      actionType: 'opt_out_marketing',
    };
  }

  return {
    actionType: 'send_custom_message',
    messageBody: action?.messageBody || 'Thanks for reaching out. Our team will follow up soon.',
    templateName: '',
    templateLanguage: '',
    flowId: '',
    flowCta: 'Open Flow',
    flowBody: 'Please complete this form.',
    attributeName: '',
    attributeValue: '',
    leadStatus: 'Qualified',
    tag: 'automation',
    webhookUrl: '',
    teamMember: '',
  };
}

export function createVisualNode(kind: VisualNodeKind, position?: { x: number; y: number }): VisualAutomationNode {
  return {
    id: createVisualClientId(),
    kind,
    x: position?.x ?? (kind === 'trigger' ? 80 : kind === 'condition' ? 410 : 760),
    y: position?.y ?? (kind === 'condition' ? 250 : 180),
    config:
      kind === 'trigger'
        ? createTriggerConfig()
        : kind === 'condition'
          ? createConditionConfig()
          : createActionConfig(),
  };
}

export function createVisualDraft(rule?: AutomationRule): VisualAutomationDraft {
  const conditions = rule?.filters?.conditions.length
    ? rule.filters.conditions
    : rule?.action.filters?.conditions || [];
  const conditionNodes = conditions.length
    ? conditions.map((condition, index): VisualAutomationNode => ({
        id: createVisualClientId(),
        kind: 'condition',
        x: 410,
        y: 140 + index * 170,
        config: createConditionConfig(condition),
      }))
    : [createVisualNode('condition')];

  return {
    clientId: createVisualClientId(),
    id: rule?.id,
    name: rule?.name || '',
    isEnabled: rule ? rule.isEnabled : true,
    createdAt: rule?.createdAt,
    updatedAt: rule?.updatedAt,
    triggerCount: rule?.triggerCount,
    nodes: [
      {
        id: createVisualClientId(),
        kind: 'trigger',
        x: 80,
        y: 180,
        config: createTriggerConfig(rule),
      },
      ...conditionNodes,
      {
        id: createVisualClientId(),
        kind: 'action',
        x: 780,
        y: 180,
        config: createActionConfig(rule?.action),
      },
    ],
  };
}

export function automationRuleToInput(rule: AutomationRule): AutomationRuleInput {
  return {
    id: rule.id,
    name: rule.name,
    isEnabled: rule.isEnabled,
    triggerType: rule.triggerType,
    keyword: rule.keyword,
    keywordMatchMode: rule.keywordMatchMode,
    filters: rule.filters,
    action: rule.action,
  };
}

function getVisualKeywordMatchMethod(operator?: AutomationRuleFilterOperator): VisualKeywordMatchMethod {
  if (operator === 'equals' || operator === 'starts_with' || operator === 'ends_with' || operator === 'fuzzy') {
    return operator;
  }

  return 'contains';
}

function getVisualAttributeOperator(operator?: AutomationRuleFilterOperator): VisualAttributeOperator {
  if (operator === 'contains' || operator === 'does_not_equal') {
    return operator;
  }

  return 'equals';
}

function getKeywordOperator(method: VisualKeywordMatchMethod): AutomationRuleFilterOperator {
  return method === 'contains' ? 'contains_any' : method;
}

function getKeywordMatchMode(method: VisualKeywordMatchMethod): AutomationRuleKeywordMatchMode {
  return method === 'contains' ? 'contains' : method;
}

function parseKeywordValues(value: string) {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function buildCondition(config: VisualConditionConfig, index: number): AutomationRuleFilterCondition {
  if (!isLiveSupportedCondition(config.conditionType)) {
    throw new Error(`${getVisualConditionLabel(config.conditionType)} is ready in the builder UI, but is not connected to live automation execution yet.`);
  }

  if (config.conditionType === 'keyword_rule') {
    const values = parseKeywordValues(config.keyword);

    if (!values.length) {
      throw new Error(`Condition ${index + 1} needs at least one keyword.`);
    }

    return {
      id: createVisualClientId(),
      type: 'message_contains_keywords',
      operator: getKeywordOperator(config.matchMethod),
      values,
    };
  }

  if (config.conditionType === 'contact_attribute') {
    const field = config.attributeName.trim();
    const value = config.attributeValue.trim();

    if (!field || !value) {
      throw new Error(`Condition ${index + 1} needs a contact attribute and value.`);
    }

    return {
      id: createVisualClientId(),
      type: 'contact_attribute',
      operator: config.attributeOperator,
      field,
      value,
    };
  }

  if (config.conditionType === 'lead_status') {
    const value = config.leadStatus.trim();

    if (!value) {
      throw new Error(`Condition ${index + 1} needs a lead status.`);
    }

    return {
      id: createVisualClientId(),
      type: 'contact_attribute',
      operator: 'equals',
      field: 'status',
      value,
    };
  }

  if (config.conditionType === 'timestamp') {
    return {
      id: createVisualClientId(),
      type: 'timestamp',
      operator: config.booleanOperator === 'is_false' ? 'outside' : 'between',
      startTime: config.startTime,
      endTime: config.endTime,
    };
  }

  return {
    id: createVisualClientId(),
    type: config.conditionType as AutomationRuleFilterCondition['type'],
    operator: config.booleanOperator,
  };
}

function buildAction(config: VisualActionConfig): AutomationRuleAction {
  if (!isLiveSupportedAction(config.actionType)) {
    throw new Error(`${getVisualActionLabel(config.actionType)} is ready in the builder UI, but is not connected to live automation execution yet.`);
  }

  if (config.actionType === 'send_template_message') {
    if (!config.templateName.trim() || !config.templateLanguage.trim()) {
      throw new Error('Choose a template name and language before saving.');
    }

    return {
      type: 'send_template',
      templateName: config.templateName.trim(),
      templateLanguage: config.templateLanguage.trim(),
    };
  }

  if (config.actionType === 'send_flow') {
    if (!config.flowId.trim()) {
      throw new Error('Choose a WhatsApp Flow before saving.');
    }

    if (!config.flowBody.trim()) {
      throw new Error('Add the Flow message body before saving.');
    }

    return {
      type: 'send_flow',
      flowId: config.flowId.trim(),
      flowCta: config.flowCta.trim() || 'Open Flow',
      flowBody: config.flowBody.trim(),
      flowMode: 'published',
      flowAction: 'navigate',
    };
  }

  if (config.actionType === 'opt_out_marketing') {
    return {
      type: 'opt_out_marketing',
    };
  }

  const messageBody = config.messageBody.trim();

  if (!messageBody) {
    throw new Error('Add a custom message before saving.');
  }

  return {
    type: 'send_text',
    messageBody,
  };
}

export function buildAutomationRuleInputFromVisualDraft(draft: VisualAutomationDraft): AutomationRuleInput {
  const triggerNode = draft.nodes.find((node) => node.kind === 'trigger');
  const actionNode = draft.nodes.find((node) => node.kind === 'action');

  if (!triggerNode || triggerNode.kind !== 'trigger') {
    throw new Error('Add a Trigger node before saving.');
  }

  if (!actionNode || actionNode.kind !== 'action') {
    throw new Error('Add an Action node before saving.');
  }

  const triggerConfig = triggerNode.config as VisualTriggerConfig;
  const actionConfig = actionNode.config as VisualActionConfig;

  if (!isLiveSupportedTrigger(triggerConfig.triggerType)) {
    throw new Error(`${getVisualTriggerLabel(triggerConfig.triggerType)} is ready in the builder UI, but is not connected to live automation execution yet.`);
  }

  const conditions = draft.nodes
    .filter((node) => node.kind === 'condition')
    .map((node, index) => buildCondition(node.config as VisualConditionConfig, index));
  const firstKeywordCondition = conditions.find((condition) => condition.type === 'message_contains_keywords');
  const firstKeyword = firstKeywordCondition?.values?.[0] || '*';
  const firstKeywordOperator = firstKeywordCondition?.operator;
  const keywordMatchMode = firstKeywordOperator
    ? getKeywordMatchMode(getVisualKeywordMatchMethod(firstKeywordOperator))
    : 'any';
  const filters: AutomationRuleFilterGroup = {
    operator: 'AND',
    conditions,
  };
  const action = {
    ...buildAction(actionConfig),
    filters,
  };

  return {
    id: draft.id,
    name: draft.name.trim() || 'Untitled automation',
    isEnabled: draft.isEnabled,
    triggerType: triggerConfig.triggerType as AutomationRuleTriggerType,
    keyword: firstKeyword,
    keywordMatchMode,
    filters,
    action,
  };
}
