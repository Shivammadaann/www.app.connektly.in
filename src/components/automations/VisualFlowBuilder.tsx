import { useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, PointerEvent as ReactPointerEvent } from 'react';
import {
  ArrowLeft,
  Beaker,
  GitBranch,
  GripVertical,
  Loader2,
  Maximize2,
  Minus,
  MousePointer2,
  Plus,
  Save,
  Send,
  Trash2,
  Workflow,
  Zap,
} from 'lucide-react';
import { motion } from 'motion/react';
import { DropdownSelect } from '../ui/DropdownSelect';
import type { MetaTemplate, WhatsAppFlow } from '../../lib/types';
import {
  ATTRIBUTE_OPERATOR_OPTIONS,
  KEYWORD_MATCH_OPTIONS,
  VISUAL_ACTION_OPTIONS,
  VISUAL_CONDITION_OPTIONS,
  VISUAL_TRIGGER_OPTIONS,
  createVisualNode,
  getDraftTitle,
  getVisualActionLabel,
  getVisualConditionLabel,
  getVisualTriggerLabel,
  isLiveSupportedAction,
  isLiveSupportedCondition,
  isLiveSupportedTrigger,
  type VisualActionConfig,
  type VisualAutomationDraft,
  type VisualAutomationNode,
  type VisualConditionConfig,
  type VisualNodeKind,
  type VisualTriggerConfig,
} from '../../lib/automation-visual-builder';

const NODE_WIDTH = 260;
const NODE_HEIGHT = 128;
const CANVAS_WIDTH = 1380;
const CANVAS_HEIGHT = 860;
const MIN_ZOOM = 0.55;
const MAX_ZOOM = 1.45;

type DragState =
  | {
      type: 'node';
      nodeId: string;
      startClientX: number;
      startClientY: number;
      startX: number;
      startY: number;
    }
  | {
      type: 'pan';
      startClientX: number;
      startClientY: number;
      startPanX: number;
      startPanY: number;
    };

type TestResult = {
  status: 'matched' | 'skipped' | 'error';
  message: string;
};

const DEFAULT_TEST_PAYLOAD = JSON.stringify(
  {
    message: {
      type: 'text',
      text: 'Hi, I need pricing help',
    },
    contact: {
      status: 'New Lead',
      source: 'Website',
      labels: ['vip'],
    },
    isNewConversation: true,
    contactExists: true,
  },
  null,
  2,
);

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function updateNode(
  draft: VisualAutomationDraft,
  nodeId: string,
  updater: (node: VisualAutomationNode) => VisualAutomationNode,
): VisualAutomationDraft {
  return {
    ...draft,
    nodes: draft.nodes.map((node) => (node.id === nodeId ? updater(node) : node)),
  };
}

function getNodeTitle(node: VisualAutomationNode) {
  if (node.kind === 'trigger') {
    return getVisualTriggerLabel((node.config as VisualTriggerConfig).triggerType);
  }

  if (node.kind === 'condition') {
    return getVisualConditionLabel((node.config as VisualConditionConfig).conditionType);
  }

  return getVisualActionLabel((node.config as VisualActionConfig).actionType);
}

function getNodeSubtitle(node: VisualAutomationNode) {
  if (node.kind === 'trigger') {
    const config = node.config as VisualTriggerConfig;
    return isLiveSupportedTrigger(config.triggerType) ? 'Live trigger' : 'UI draft';
  }

  if (node.kind === 'condition') {
    const config = node.config as VisualConditionConfig;

    if (config.conditionType === 'keyword_rule') {
      return config.keyword ? `${config.matchMethod.replace('_', ' ')}: ${config.keyword}` : 'Keyword rule';
    }

    if (config.conditionType === 'contact_attribute') {
      return config.attributeName ? `${config.attributeName} ${config.attributeOperator.replace(/_/g, ' ')}` : 'Contact logic';
    }

    if (config.conditionType === 'lead_status') {
      return config.leadStatus || 'Lead status';
    }

    return isLiveSupportedCondition(config.conditionType) ? 'Live condition' : 'UI draft';
  }

  const config = node.config as VisualActionConfig;
  if (config.actionType === 'send_template_message') {
    return config.templateName || 'Template message';
  }

  if (config.actionType === 'send_flow') {
    return config.flowCta || 'WhatsApp Flow';
  }

  if (config.actionType === 'send_custom_message') {
    return config.messageBody ? 'Custom message' : 'Message action';
  }

  if (config.actionType === 'opt_out_marketing') {
    return 'Marketing opt-out';
  }

  return isLiveSupportedAction(config.actionType) ? 'Live action' : 'UI draft';
}

function getNodeIcon(kind: VisualNodeKind) {
  if (kind === 'trigger') {
    return <Zap className="h-4 w-4" />;
  }

  if (kind === 'condition') {
    return <GitBranch className="h-4 w-4" />;
  }

  return <Send className="h-4 w-4" />;
}

function getOrderedNodes(nodes: VisualAutomationNode[]) {
  const trigger = nodes.find((node) => node.kind === 'trigger');
  const action = nodes.find((node) => node.kind === 'action');
  const conditions = nodes
    .filter((node) => node.kind === 'condition')
    .sort((left, right) => left.y - right.y || left.x - right.x);

  return [trigger, ...conditions, action].filter((node): node is VisualAutomationNode => Boolean(node));
}

function getConnectionPath(left: VisualAutomationNode, right: VisualAutomationNode) {
  const startX = left.x + NODE_WIDTH;
  const startY = left.y + NODE_HEIGHT / 2;
  const endX = right.x;
  const endY = right.y + NODE_HEIGHT / 2;
  const curve = Math.max(80, Math.abs(endX - startX) * 0.42);

  return `M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`;
}

function extractPayloadText(payload: Record<string, unknown>) {
  const message = payload.message;

  if (message && typeof message === 'object' && !Array.isArray(message)) {
    const record = message as Record<string, unknown>;
    return String(record.text || record.body || '');
  }

  return String(payload.text || payload.body || '');
}

function getPayloadContact(payload: Record<string, unknown>) {
  const contact = payload.contact;
  return contact && typeof contact === 'object' && !Array.isArray(contact)
    ? (contact as Record<string, unknown>)
    : {};
}

function fuzzyMatch(text: string, keyword: string) {
  const normalizedText = text.toLowerCase();
  const normalizedKeyword = keyword.toLowerCase();

  if (normalizedText.includes(normalizedKeyword)) {
    return true;
  }

  return normalizedText.split(/\s+/).some((token) => {
    if (Math.abs(token.length - normalizedKeyword.length) > 2) {
      return false;
    }

    let mismatches = 0;
    const length = Math.max(token.length, normalizedKeyword.length);

    for (let index = 0; index < length; index += 1) {
      if (token[index] !== normalizedKeyword[index]) {
        mismatches += 1;
      }
    }

    return mismatches <= 2;
  });
}

function evaluateCondition(config: VisualConditionConfig, payload: Record<string, unknown>) {
  const body = extractPayloadText(payload).toLowerCase();
  const contact = getPayloadContact(payload);

  if (config.conditionType === 'keyword_rule') {
    const keywords = config.keyword
      .split(',')
      .map((keyword) => keyword.trim().toLowerCase())
      .filter(Boolean);

    if (!keywords.length || !body) {
      return false;
    }

    return keywords.some((keyword) => {
      if (config.matchMethod === 'equals') return body === keyword;
      if (config.matchMethod === 'starts_with') return body.startsWith(keyword);
      if (config.matchMethod === 'ends_with') return body.endsWith(keyword);
      if (config.matchMethod === 'fuzzy') return fuzzyMatch(body, keyword);
      return body.includes(keyword);
    });
  }

  if (config.conditionType === 'contact_attribute') {
    const actual = String(contact[config.attributeName] || '').toLowerCase();
    const expected = config.attributeValue.toLowerCase();

    if (config.attributeOperator === 'does_not_equal') {
      return actual !== expected;
    }

    return config.attributeOperator === 'equals' ? actual === expected : actual.includes(expected);
  }

  if (config.conditionType === 'lead_status') {
    return String(contact.status || '').toLowerCase() === config.leadStatus.toLowerCase();
  }

  if (config.conditionType === 'message_type') {
    const message = payload.message;
    const messageType =
      message && typeof message === 'object' && !Array.isArray(message)
        ? String((message as Record<string, unknown>).type || '')
        : String(payload.messageType || '');
    return messageType === config.messageType;
  }

  if (config.conditionType === 'contact_initiates_chat') {
    return Boolean(payload.isNewConversation);
  }

  if (config.conditionType === 'contact_exists') {
    const exists = Boolean(payload.contactExists ?? Object.keys(contact).length > 0);
    return config.booleanOperator === 'is_false' ? !exists : exists;
  }

  if (config.conditionType === 'no_keyword_matches') {
    return Boolean(payload.noKeywordMatches);
  }

  return true;
}

function NodeCard({
  node,
  isSelected,
  onSelect,
  onPointerDown,
}: {
  key?: string;
  node: VisualAutomationNode;
  isSelected: boolean;
  onSelect: () => void;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  const toneClassName =
    node.kind === 'trigger'
      ? 'bg-[#eef2ff] text-[#4338ca]'
      : node.kind === 'condition'
        ? 'bg-amber-50 text-amber-700'
        : 'bg-emerald-50 text-emerald-700';

  return (
    <button
      type="button"
      onClick={onSelect}
      onPointerDown={onPointerDown}
      style={{
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        transform: `translate(${node.x}px, ${node.y}px)`,
      }}
      className={`absolute left-0 top-0 rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        isSelected ? 'border-[#1381FF] ring-4 ring-[#1381FF]/10' : 'border-gray-200'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneClassName}`}>
          {getNodeIcon(node.kind)}
        </div>
        <GripVertical className="h-4 w-4 shrink-0 text-gray-300" />
      </div>
      <p className="mt-4 line-clamp-2 text-sm font-semibold leading-5 text-gray-900">{getNodeTitle(node)}</p>
      <p className="mt-1 truncate text-xs text-gray-500">{getNodeSubtitle(node)}</p>
    </button>
  );
}

function CanvasControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onReset,
}: {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}) {
  return (
    <div className="absolute bottom-4 left-4 z-20 flex items-center overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={onZoomOut}
        title="Zoom out"
        className="inline-flex h-10 w-10 items-center justify-center text-gray-600 transition hover:bg-gray-50"
      >
        <Minus className="h-4 w-4" />
      </button>
      <span className="min-w-16 border-x border-gray-100 px-3 text-center text-xs font-semibold text-gray-600">
        {Math.round(zoom * 100)}%
      </span>
      <button
        type="button"
        onClick={onZoomIn}
        title="Zoom in"
        className="inline-flex h-10 w-10 items-center justify-center text-gray-600 transition hover:bg-gray-50"
      >
        <Plus className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onReset}
        title="Reset view"
        className="inline-flex h-10 w-10 items-center justify-center border-l border-gray-100 text-gray-600 transition hover:bg-gray-50"
      >
        <Maximize2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function NodePalette({
  onDragStart,
  onAddCondition,
}: {
  onDragStart: (event: DragEvent<HTMLButtonElement>, kind: VisualNodeKind) => void;
  onAddCondition: () => void;
}) {
  return (
    <div className="absolute left-4 top-4 z-20 w-[min(260px,calc(100%-2rem))] rounded-2xl border border-gray-200 bg-white/95 p-3 shadow-sm backdrop-blur">
      <div className="flex items-center gap-2 px-1 pb-2">
        <MousePointer2 className="h-4 w-4 text-[#1381FF]" />
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Nodes</p>
      </div>
      <div className="grid gap-2">
        {(['trigger', 'condition', 'action'] as VisualNodeKind[]).map((kind) => (
          <button
            key={kind}
            type="button"
            draggable
            onDragStart={(event) => onDragStart(event, kind)}
            onClick={kind === 'condition' ? onAddCondition : undefined}
            className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-500">
              {getNodeIcon(kind)}
            </span>
            <span className="capitalize">{kind}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TestPanel({
  draft,
  payload,
  result,
  onPayloadChange,
  onRun,
}: {
  draft: VisualAutomationDraft;
  payload: string;
  result: TestResult | null;
  onPayloadChange: (payload: string) => void;
  onRun: () => void;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">Test Flow</p>
          <p className="mt-0.5 text-xs text-gray-500">{getDraftTitle(draft)}</p>
        </div>
        <span className="rounded-full border border-amber-100 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
          Mock
        </span>
      </div>
      <textarea
        value={payload}
        onChange={(event) => onPayloadChange(event.target.value)}
        rows={9}
        className="mt-3 w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-3 font-mono text-xs leading-5 text-gray-800 outline-none transition focus:border-[#1381FF] focus:ring-1 focus:ring-[#1381FF]"
      />
      <button
        type="button"
        onClick={onRun}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#111827] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#1f2937]"
      >
        <Beaker className="h-4 w-4" />
        Run Test
      </button>
      {result ? (
        <div
          className={`mt-3 rounded-xl border px-3 py-3 text-sm ${
            result.status === 'matched'
              ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
              : result.status === 'error'
                ? 'border-rose-100 bg-rose-50 text-rose-700'
                : 'border-amber-100 bg-amber-50 text-amber-700'
          }`}
        >
          {result.message}
        </div>
      ) : null}
    </div>
  );
}

function NodeConfigPanel({
  draft,
  selectedNode,
  templates,
  flows,
  onDraftChange,
  onRemoveCondition,
}: {
  draft: VisualAutomationDraft;
  selectedNode: VisualAutomationNode | null;
  templates: MetaTemplate[];
  flows: WhatsAppFlow[];
  onDraftChange: (draft: VisualAutomationDraft) => void;
  onRemoveCondition: (nodeId: string) => void;
}) {
  const updateSelectedNode = (updater: (node: VisualAutomationNode) => VisualAutomationNode) => {
    if (!selectedNode) {
      return;
    }

    onDraftChange(updateNode(draft, selectedNode.id, updater));
  };

  if (!selectedNode) {
    return (
      <aside className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#1381FF]/10 text-[#1381FF]">
          <Workflow className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-gray-900">Select a node</h2>
        <p className="mt-2 text-sm leading-6 text-gray-500">
          Node settings open here while the canvas stays in place.
        </p>
      </aside>
    );
  }

  const sectionTitle =
    selectedNode.kind === 'trigger' ? 'Trigger Details' : selectedNode.kind === 'condition' ? 'Condition Details' : 'Action Details';

  return (
    <aside className="min-h-0 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#1381FF]">{selectedNode.kind}</p>
        <h2 className="mt-1 text-lg font-semibold text-gray-900">{sectionTitle}</h2>
      </div>
      <div className="max-h-[calc(100dvh-260px)] space-y-5 overflow-y-auto px-5 py-5 lg:max-h-[calc(100dvh-230px)]">
        {selectedNode.kind === 'trigger' ? (
          <TriggerConfig
            config={selectedNode.config as VisualTriggerConfig}
            onChange={(config) => updateSelectedNode((node) => ({ ...node, config }))}
          />
        ) : null}

        {selectedNode.kind === 'condition' ? (
          <ConditionConfig
            config={selectedNode.config as VisualConditionConfig}
            onChange={(config) => updateSelectedNode((node) => ({ ...node, config }))}
            onRemove={() => onRemoveCondition(selectedNode.id)}
          />
        ) : null}

        {selectedNode.kind === 'action' ? (
          <ActionConfig
            config={selectedNode.config as VisualActionConfig}
            templates={templates}
            flows={flows}
            onChange={(config) => updateSelectedNode((node) => ({ ...node, config }))}
          />
        ) : null}
      </div>
    </aside>
  );
}

function TriggerConfig({
  config,
  onChange,
}: {
  config: VisualTriggerConfig;
  onChange: (config: VisualTriggerConfig) => void;
}) {
  const option = VISUAL_TRIGGER_OPTIONS.find((item) => item.value === config.triggerType);

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">Trigger Type</label>
        <DropdownSelect
          value={config.triggerType}
          onChange={(triggerType) => onChange({ ...config, triggerType: triggerType as VisualTriggerConfig['triggerType'] })}
          options={VISUAL_TRIGGER_OPTIONS.map((item) => ({
            value: item.value,
            label: item.isLiveSupported ? item.label : `${item.label} (UI only)`,
          }))}
          ariaLabel="Select trigger type"
          buttonClassName="rounded-xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#1381FF] focus:ring-[#1381FF]/15"
        />
      </div>
      {option ? (
        <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm leading-6 text-gray-600">
          {option.description}
        </div>
      ) : null}
    </div>
  );
}

function ConditionConfig({
  config,
  onChange,
  onRemove,
}: {
  config: VisualConditionConfig;
  onChange: (config: VisualConditionConfig) => void;
  onRemove: () => void;
}) {
  const option = VISUAL_CONDITION_OPTIONS.find((item) => item.value === config.conditionType);

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">Condition Type</label>
        <DropdownSelect
          value={config.conditionType}
          onChange={(conditionType) => onChange({ ...config, conditionType: conditionType as VisualConditionConfig['conditionType'] })}
          options={VISUAL_CONDITION_OPTIONS.map((item) => ({
            value: item.value,
            label: item.isLiveSupported ? item.label : `${item.label} (UI only)`,
          }))}
          ariaLabel="Select condition type"
          buttonClassName="rounded-xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#1381FF] focus:ring-[#1381FF]/15"
        />
      </div>

      {config.conditionType === 'keyword_rule' ? (
        <>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-gray-700">Keywords</span>
            <input
              value={config.keyword}
              onChange={(event) => onChange({ ...config, keyword: event.target.value })}
              placeholder="pricing, help, order"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#1381FF] focus:ring-1 focus:ring-[#1381FF]"
            />
          </label>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Matching Method</label>
            <DropdownSelect
              value={config.matchMethod}
              onChange={(matchMethod) => onChange({ ...config, matchMethod: matchMethod as VisualConditionConfig['matchMethod'] })}
              options={KEYWORD_MATCH_OPTIONS}
              ariaLabel="Select keyword match method"
              buttonClassName="rounded-xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#1381FF] focus:ring-[#1381FF]/15"
            />
          </div>
        </>
      ) : null}

      {config.conditionType === 'contact_attribute' ? (
        <>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-gray-700">Attribute</span>
            <input
              value={config.attributeName}
              onChange={(event) => onChange({ ...config, attributeName: event.target.value })}
              placeholder="source, city, labels"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#1381FF] focus:ring-1 focus:ring-[#1381FF]"
            />
          </label>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Operator</label>
            <DropdownSelect
              value={config.attributeOperator}
              onChange={(attributeOperator) =>
                onChange({ ...config, attributeOperator: attributeOperator as VisualConditionConfig['attributeOperator'] })
              }
              options={ATTRIBUTE_OPERATOR_OPTIONS}
              ariaLabel="Select attribute operator"
              buttonClassName="rounded-xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#1381FF] focus:ring-[#1381FF]/15"
            />
          </div>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-gray-700">Value</span>
            <input
              value={config.attributeValue}
              onChange={(event) => onChange({ ...config, attributeValue: event.target.value })}
              placeholder="vip"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#1381FF] focus:ring-1 focus:ring-[#1381FF]"
            />
          </label>
        </>
      ) : null}

      {config.conditionType === 'lead_status' ? (
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-gray-700">Lead Status</span>
          <input
            value={config.leadStatus}
            onChange={(event) => onChange({ ...config, leadStatus: event.target.value })}
            placeholder="Qualified"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#1381FF] focus:ring-1 focus:ring-[#1381FF]"
          />
        </label>
      ) : null}

      {config.conditionType === 'message_type' ? (
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">Message Type</label>
          <DropdownSelect
            value={config.messageType}
            onChange={(messageType) => onChange({ ...config, messageType: messageType as VisualConditionConfig['messageType'] })}
            options={[
              { value: 'text', label: 'Text' },
              { value: 'image', label: 'Image' },
              { value: 'button_reply', label: 'Button Reply' },
            ]}
            ariaLabel="Select message type"
            buttonClassName="rounded-xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#1381FF] focus:ring-[#1381FF]/15"
          />
        </div>
      ) : null}

      {config.conditionType === 'timestamp' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-gray-700">Start Time</span>
            <input
              type="time"
              value={config.startTime}
              onChange={(event) => onChange({ ...config, startTime: event.target.value })}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#1381FF] focus:ring-1 focus:ring-[#1381FF]"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-gray-700">End Time</span>
            <input
              type="time"
              value={config.endTime}
              onChange={(event) => onChange({ ...config, endTime: event.target.value })}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#1381FF] focus:ring-1 focus:ring-[#1381FF]"
            />
          </label>
        </div>
      ) : null}

      {option ? (
        <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm leading-6 text-gray-600">
          {option.description}
        </div>
      ) : null}

      <button
        type="button"
        onClick={onRemove}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-100 bg-white px-4 py-3 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
      >
        <Trash2 className="h-4 w-4" />
        Remove Condition
      </button>
    </div>
  );
}

function ActionConfig({
  config,
  templates,
  flows,
  onChange,
}: {
  config: VisualActionConfig;
  templates: MetaTemplate[];
  flows: WhatsAppFlow[];
  onChange: (config: VisualActionConfig) => void;
}) {
  const option = VISUAL_ACTION_OPTIONS.find((item) => item.value === config.actionType);
  const selectedTemplateValue =
    config.templateName && config.templateLanguage ? `${config.templateName}::${config.templateLanguage}` : '';

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">Action Type</label>
        <DropdownSelect
          value={config.actionType}
          onChange={(actionType) => onChange({ ...config, actionType: actionType as VisualActionConfig['actionType'] })}
          options={VISUAL_ACTION_OPTIONS.map((item) => ({
            value: item.value,
            label: item.isLiveSupported ? item.label : `${item.label} (UI only)`,
          }))}
          ariaLabel="Select action type"
          buttonClassName="rounded-xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#1381FF] focus:ring-[#1381FF]/15"
        />
      </div>

      {config.actionType === 'send_custom_message' ? (
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-gray-700">Message</span>
          <textarea
            value={config.messageBody}
            onChange={(event) => onChange({ ...config, messageBody: event.target.value })}
            rows={5}
            className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#1381FF] focus:ring-1 focus:ring-[#1381FF]"
          />
        </label>
      ) : null}

      {config.actionType === 'send_template_message' ? (
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">Template</label>
          <DropdownSelect
            value={selectedTemplateValue}
            onChange={(templateValue) => {
              const [templateName, templateLanguage] = templateValue.split('::');
              onChange({
                ...config,
                templateName: templateName || '',
                templateLanguage: templateLanguage || '',
              });
            }}
            options={[
              { value: '', label: 'Select template' },
              ...templates.map((template) => ({
                value: `${template.name}::${template.language}`,
                label: `${template.name} (${template.language})`,
              })),
            ]}
            placeholder="Select template"
            ariaLabel="Select action template"
            buttonClassName="rounded-xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#1381FF] focus:ring-[#1381FF]/15"
          />
          {!templates.length ? <p className="mt-2 text-xs text-gray-500">No approved templates are available.</p> : null}
        </div>
      ) : null}

      {config.actionType === 'send_flow' ? (
        <>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">WhatsApp Flow</label>
            <DropdownSelect
              value={config.flowId}
              onChange={(flowId) => onChange({ ...config, flowId })}
              options={[
                { value: '', label: 'Select Flow' },
                ...flows.map((flow) => ({
                  value: flow.id,
                  label: `${flow.name} (${flow.status})`,
                })),
              ]}
              placeholder="Select Flow"
              ariaLabel="Select WhatsApp Flow action"
              buttonClassName="rounded-xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#1381FF] focus:ring-[#1381FF]/15"
            />
          </div>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-gray-700">CTA Text</span>
            <input
              value={config.flowCta}
              maxLength={30}
              onChange={(event) => onChange({ ...config, flowCta: event.target.value })}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#1381FF] focus:ring-1 focus:ring-[#1381FF]"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-gray-700">Message Body</span>
            <textarea
              value={config.flowBody}
              rows={4}
              onChange={(event) => onChange({ ...config, flowBody: event.target.value })}
              className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#1381FF] focus:ring-1 focus:ring-[#1381FF]"
            />
          </label>
        </>
      ) : null}

      {config.actionType === 'update_contact_attribute' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-gray-700">Attribute</span>
            <input
              value={config.attributeName}
              onChange={(event) => onChange({ ...config, attributeName: event.target.value })}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#1381FF] focus:ring-1 focus:ring-[#1381FF]"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-gray-700">Value</span>
            <input
              value={config.attributeValue}
              onChange={(event) => onChange({ ...config, attributeValue: event.target.value })}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#1381FF] focus:ring-1 focus:ring-[#1381FF]"
            />
          </label>
        </div>
      ) : null}

      {config.actionType === 'update_lead_status' ? (
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-gray-700">Lead Status</span>
          <input
            value={config.leadStatus}
            onChange={(event) => onChange({ ...config, leadStatus: event.target.value })}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#1381FF] focus:ring-1 focus:ring-[#1381FF]"
          />
        </label>
      ) : null}

      {config.actionType === 'add_tag' ? (
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-gray-700">Tag / Label</span>
          <input
            value={config.tag}
            onChange={(event) => onChange({ ...config, tag: event.target.value })}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#1381FF] focus:ring-1 focus:ring-[#1381FF]"
          />
        </label>
      ) : null}

      {config.actionType === 'trigger_webhook' ? (
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-gray-700">Webhook URL</span>
          <input
            value={config.webhookUrl}
            onChange={(event) => onChange({ ...config, webhookUrl: event.target.value })}
            placeholder="https://example.com/webhook"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#1381FF] focus:ring-1 focus:ring-[#1381FF]"
          />
        </label>
      ) : null}

      {config.actionType === 'notify_team_member' ? (
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-gray-700">Team Member</span>
          <input
            value={config.teamMember}
            onChange={(event) => onChange({ ...config, teamMember: event.target.value })}
            placeholder="agent@company.com"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#1381FF] focus:ring-1 focus:ring-[#1381FF]"
          />
        </label>
      ) : null}

      {option ? (
        <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm leading-6 text-gray-600">
          {option.description}
        </div>
      ) : null}
    </div>
  );
}

export default function VisualFlowBuilder({
  draft,
  templates,
  flows,
  isSaving,
  onDraftChange,
  onSave,
  onBack,
}: {
  draft: VisualAutomationDraft;
  templates: MetaTemplate[];
  flows: WhatsAppFlow[];
  isSaving: boolean;
  onDraftChange: (draft: VisualAutomationDraft) => void;
  onSave: () => void;
  onBack: () => void;
}) {
  const [selectedNodeId, setSelectedNodeId] = useState(() => draft.nodes[0]?.id || null);
  const [zoom, setZoom] = useState(0.9);
  const [pan, setPan] = useState({ x: 70, y: 56 });
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [isTestOpen, setIsTestOpen] = useState(false);
  const [testPayload, setTestPayload] = useState(DEFAULT_TEST_PAYLOAD);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const selectedNode = draft.nodes.find((node) => node.id === selectedNodeId) || null;
  const orderedNodes = useMemo(() => getOrderedNodes(draft.nodes), [draft.nodes]);

  useEffect(() => {
    if (selectedNodeId && draft.nodes.some((node) => node.id === selectedNodeId)) {
      return;
    }

    setSelectedNodeId(draft.nodes[0]?.id || null);
  }, [draft.nodes, selectedNodeId]);

  useEffect(() => {
    if (!dragState) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (dragState.type === 'node') {
        const nextX = clamp(dragState.startX + (event.clientX - dragState.startClientX) / zoom, 20, CANVAS_WIDTH - NODE_WIDTH - 20);
        const nextY = clamp(dragState.startY + (event.clientY - dragState.startClientY) / zoom, 20, CANVAS_HEIGHT - NODE_HEIGHT - 20);

        onDraftChange(
          updateNode(draft, dragState.nodeId, (node) => ({
            ...node,
            x: Math.round(nextX),
            y: Math.round(nextY),
          })),
        );
        return;
      }

      setPan({
        x: dragState.startPanX + event.clientX - dragState.startClientX,
        y: dragState.startPanY + event.clientY - dragState.startClientY,
      });
    };

    const handlePointerUp = () => setDragState(null);

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [draft, dragState, onDraftChange, zoom]);

  const addNode = (kind: VisualNodeKind, position?: { x: number; y: number }) => {
    const existingSingleton =
      kind === 'trigger' || kind === 'action' ? draft.nodes.find((node) => node.kind === kind) : null;

    if (existingSingleton) {
      setSelectedNodeId(existingSingleton.id);
      return;
    }

    const node = createVisualNode(kind, position);
    onDraftChange({
      ...draft,
      nodes: [...draft.nodes, node],
    });
    setSelectedNodeId(node.id);
  };

  const removeCondition = (nodeId: string) => {
    const conditionCount = draft.nodes.filter((node) => node.kind === 'condition').length;

    if (conditionCount <= 1) {
      return;
    }

    const nextNodes = draft.nodes.filter((node) => node.id !== nodeId);
    onDraftChange({ ...draft, nodes: nextNodes });
    setSelectedNodeId(nextNodes.find((node) => node.kind === 'condition')?.id || nextNodes[0]?.id || null);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const kind = event.dataTransfer.getData('application/connektly-node-kind') as VisualNodeKind;

    if (kind !== 'trigger' && kind !== 'condition' && kind !== 'action') {
      return;
    }

    const rect = viewportRef.current?.getBoundingClientRect();
    const x = rect ? (event.clientX - rect.left - pan.x) / zoom : 120;
    const y = rect ? (event.clientY - rect.top - pan.y) / zoom : 120;
    addNode(kind, {
      x: clamp(Math.round(x - NODE_WIDTH / 2), 20, CANVAS_WIDTH - NODE_WIDTH - 20),
      y: clamp(Math.round(y - NODE_HEIGHT / 2), 20, CANVAS_HEIGHT - NODE_HEIGHT - 20),
    });
  };

  const runTest = () => {
    try {
      const parsed = JSON.parse(testPayload) as Record<string, unknown>;
      const conditions = draft.nodes
        .filter((node) => node.kind === 'condition')
        .map((node) => evaluateCondition(node.config as VisualConditionConfig, parsed));
      const matched = conditions.length ? conditions.every(Boolean) : true;
      const actionNode = draft.nodes.find((node) => node.kind === 'action');
      const actionLabel = actionNode ? getNodeTitle(actionNode) : 'Action';

      setTestResult({
        status: matched ? 'matched' : 'skipped',
        message: matched ? `Matched. Next action: ${actionLabel}.` : 'Skipped. One or more conditions did not match.',
      });
    } catch (error) {
      setTestResult({
        status: 'error',
        message: error instanceof Error ? error.message : 'Invalid mock payload.',
      });
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4 shadow-sm sm:px-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-3 md:flex-row md:items-center">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex w-fit items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Cancel / Back
            </button>
            <div className="min-w-0 flex-1">
              <label className="sr-only" htmlFor="visual-automation-name">
                Automation name
              </label>
              <input
                id="visual-automation-name"
                value={draft.name}
                onChange={(event) => onDraftChange({ ...draft, name: event.target.value })}
                placeholder="Untitled automation"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-[#1381FF] focus:ring-1 focus:ring-[#1381FF]"
              />
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={draft.isEnabled}
              onClick={() => onDraftChange({ ...draft, isEnabled: !draft.isEnabled })}
              className={`inline-flex h-11 items-center gap-3 rounded-xl border px-3 text-sm font-medium transition ${
                draft.isEnabled ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-gray-50 text-gray-600'
              }`}
            >
              <span
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                  draft.isEnabled ? 'bg-emerald-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                    draft.isEnabled ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </span>
              {draft.isEnabled ? 'On' : 'Off'}
            </button>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setIsTestOpen((current) => !current)}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
            >
              <Beaker className="h-4 w-4" />
              Test Flow
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-xl bg-[#1381FF] px-4 py-3 text-sm font-medium text-white shadow-lg shadow-[#1381FF]/25 transition hover:bg-[#4a35e8] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Changes
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <div
            ref={viewportRef}
            onDrop={handleDrop}
            onDragOver={(event) => event.preventDefault()}
            onPointerDown={(event) => {
              if (event.target !== event.currentTarget) {
                return;
              }

              setDragState({
                type: 'pan',
                startClientX: event.clientX,
                startClientY: event.clientY,
                startPanX: pan.x,
                startPanY: pan.y,
              });
            }}
            className="relative h-[640px] overflow-hidden rounded-2xl border border-gray-200 bg-[#f8fafc] shadow-sm"
          >
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  'linear-gradient(rgba(148, 163, 184, 0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(148, 163, 184, 0.18) 1px, transparent 1px)',
                backgroundSize: `${28 * zoom}px ${28 * zoom}px`,
                backgroundPosition: `${pan.x}px ${pan.y}px`,
              }}
            />

            <NodePalette
              onDragStart={(event, kind) => {
                event.dataTransfer.setData('application/connektly-node-kind', kind);
                event.dataTransfer.effectAllowed = 'copy';
              }}
              onAddCondition={() => addNode('condition')}
            />

            <div
              className="absolute left-0 top-0 origin-top-left"
              onPointerDown={(event) => {
                if (event.target !== event.currentTarget) {
                  return;
                }

                setDragState({
                  type: 'pan',
                  startClientX: event.clientX,
                  startClientY: event.clientY,
                  startPanX: pan.x,
                  startPanY: pan.y,
                });
              }}
              style={{
                width: CANVAS_WIDTH,
                height: CANVAS_HEIGHT,
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              }}
            >
              <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
                {orderedNodes.slice(0, -1).map((node, index) => {
                  const nextNode = orderedNodes[index + 1];

                  return (
                    <path
                      key={`${node.id}-${nextNode.id}`}
                      d={getConnectionPath(node, nextNode)}
                      fill="none"
                      stroke="rgba(19, 129, 255, 0.48)"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  );
                })}
              </svg>

              {draft.nodes.map((node) => (
                <NodeCard
                  key={node.id}
                  node={node}
                  isSelected={node.id === selectedNodeId}
                  onSelect={() => setSelectedNodeId(node.id)}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    setSelectedNodeId(node.id);
                    setDragState({
                      type: 'node',
                      nodeId: node.id,
                      startClientX: event.clientX,
                      startClientY: event.clientY,
                      startX: node.x,
                      startY: node.y,
                    });
                  }}
                />
              ))}
            </div>

            <CanvasControls
              zoom={zoom}
              onZoomIn={() => setZoom((current) => clamp(Number((current + 0.1).toFixed(2)), MIN_ZOOM, MAX_ZOOM))}
              onZoomOut={() => setZoom((current) => clamp(Number((current - 0.1).toFixed(2)), MIN_ZOOM, MAX_ZOOM))}
              onReset={() => {
                setZoom(0.9);
                setPan({ x: 70, y: 56 });
              }}
            />
          </div>

          {isTestOpen ? (
            <TestPanel
              draft={draft}
              payload={testPayload}
              result={testResult}
              onPayloadChange={setTestPayload}
              onRun={runTest}
            />
          ) : null}
        </div>

        <NodeConfigPanel
          draft={draft}
          selectedNode={selectedNode}
          templates={templates}
          flows={flows}
          onDraftChange={onDraftChange}
          onRemoveCondition={removeCondition}
        />
      </div>
    </motion.div>
  );
}
