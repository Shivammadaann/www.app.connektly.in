import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Loader2,
  Plus,
  RefreshCcw,
  Workflow,
} from 'lucide-react';
import AutomationRulesTable from '../../components/automations/AutomationRulesTable';
import VisualFlowBuilder from '../../components/automations/VisualFlowBuilder';
import ConfirmationDialog from '../../components/ConfirmationDialog';
import FeedbackPopupStack from '../../components/FeedbackPopupStack';
import { useAppData } from '../../context/AppDataContext';
import { appApi } from '../../lib/api';
import {
  automationRuleToInput,
  buildAutomationRuleInputFromVisualDraft,
  createVisualDraft,
  getAutomationRuleTitle,
  type VisualAutomationDraft,
} from '../../lib/automation-visual-builder';
import { sortMetaTemplates } from '../../lib/templates';
import type { AutomationRule, AutomationRuleInput, MetaTemplate, WhatsAppFlow } from '../../lib/types';

function isSendableTemplate(template: MetaTemplate) {
  const status = template.status?.trim().toUpperCase();
  return !status || status === 'APPROVED';
}

function sortRules(items: AutomationRule[]) {
  return [...items].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

export default function AutomationVisualBuilder() {
  const { bootstrap } = useAppData();
  const channel = bootstrap?.channel || null;
  const templates = useMemo(
    () => sortMetaTemplates((bootstrap?.templates || []).filter(isSendableTemplate)),
    [bootstrap?.templates],
  );
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [flows, setFlows] = useState<WhatsAppFlow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFlowsLoading, setIsFlowsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [builderDraft, setBuilderDraft] = useState<VisualAutomationDraft | null>(null);
  const [pendingDeleteRule, setPendingDeleteRule] = useState<AutomationRule | null>(null);

  const loadRules = async () => {
    if (!channel) {
      setRules([]);
      setIsLoading(false);
      setFeedback(null);
      return;
    }

    try {
      setIsLoading(true);
      setFeedback(null);
      const response = await appApi.getAutomationRules();
      setRules(sortRules(response.rules));
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Failed to load automations.' });
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
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Failed to load Flows.' });
    } finally {
      setIsFlowsLoading(false);
    }
  };

  useEffect(() => {
    void loadRules();
    void loadFlows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel?.id]);

  const persistRuleInputs = async (nextInputs: AutomationRuleInput[], successMessage: string) => {
    if (!channel) {
      setFeedback({ type: 'error', message: 'Connect a WhatsApp Business number before saving automations.' });
      return false;
    }

    try {
      setIsSaving(true);
      setFeedback(null);
      const response = await appApi.updateAutomationRules({ rules: nextInputs });
      setRules(sortRules(response.rules));
      setFeedback({ type: 'success', message: successMessage });
      return true;
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Failed to save automation.' });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const openBuilderForCreate = () => {
    setFeedback(null);
    setBuilderDraft(createVisualDraft());
  };

  const openBuilderForRule = (rule: AutomationRule) => {
    setFeedback(null);
    setBuilderDraft(createVisualDraft(rule));
  };

  const handleSaveDraft = async () => {
    if (!builderDraft) {
      return;
    }

    let input: AutomationRuleInput;

    try {
      input = buildAutomationRuleInputFromVisualDraft(builderDraft);
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Automation is not ready to save.' });
      return;
    }

    const existingInputs = rules.map(automationRuleToInput);
    const nextInputs = builderDraft.id
      ? existingInputs.map((existingInput) => (existingInput.id === builderDraft.id ? input : existingInput))
      : [input, ...existingInputs];
    const saved = await persistRuleInputs(nextInputs, builderDraft.id ? 'Automation updated.' : 'Automation created.');

    if (saved) {
      setBuilderDraft(null);
    }
  };

  const handleToggleStatus = async (rule: AutomationRule) => {
    const nextInputs = rules.map((item) => ({
      ...automationRuleToInput(item),
      isEnabled: item.id === rule.id ? !item.isEnabled : item.isEnabled,
    }));

    await persistRuleInputs(nextInputs, 'Automation status updated.');
  };

  const handleDuplicate = async (rule: AutomationRule) => {
    const duplicate: AutomationRuleInput = {
      ...automationRuleToInput(rule),
      id: undefined,
      name: `${getAutomationRuleTitle(rule)} Copy`.slice(0, 90),
      isEnabled: false,
    };

    await persistRuleInputs([duplicate, ...rules.map(automationRuleToInput)], 'Automation duplicated.');
  };

  const confirmDelete = async () => {
    if (!pendingDeleteRule) {
      return;
    }

    const nextInputs = rules
      .filter((rule) => rule.id !== pendingDeleteRule.id)
      .map(automationRuleToInput);
    const deleted = await persistRuleInputs(nextInputs, 'Automation deleted.');

    if (deleted) {
      setPendingDeleteRule(null);
    }
  };

  if (!channel) {
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-3xl border border-gray-200 bg-white px-6 py-8 shadow-sm sm:px-8 sm:py-10">
          <div className="max-w-3xl">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#eef2ff] text-[#4338ca]">
              <Workflow className="h-6 w-6" />
            </div>
            <h1 className="mt-5 text-2xl font-bold text-gray-900">Visual Builder</h1>
            <p className="mt-1 text-sm text-gray-500">
              Connect a WhatsApp Business number before creating visual automations.
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

  if (builderDraft) {
    return (
      <div className="mx-auto max-w-[1600px] space-y-4">
        <FeedbackPopupStack
          items={[
            ...(feedback
              ? [
                  {
                    id: 'visual-builder-feedback',
                    tone: feedback.type,
                    message: feedback.message,
                    onDismiss: () => setFeedback(null),
                  },
                ]
              : []),
          ]}
        />
        <VisualFlowBuilder
          draft={builderDraft}
          templates={templates}
          flows={flows}
          isSaving={isSaving}
          onDraftChange={setBuilderDraft}
          onSave={() => void handleSaveDraft()}
          onBack={() => {
            if (!isSaving) {
              setBuilderDraft(null);
            }
          }}
        />
        {isFlowsLoading ? (
          <div className="fixed bottom-4 right-4 z-[110] inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-600 shadow-lg">
            <Loader2 className="h-4 w-4 animate-spin text-[#5b45ff]" />
            Loading Flows
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Visual Builder</h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-500">
            View automations, then build trigger, condition, and action flows on a visual canvas.
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
            onClick={openBuilderForCreate}
            disabled={isLoading || isSaving}
            className="inline-flex items-center gap-2 rounded-2xl bg-[#5b45ff] px-4 py-3 text-sm font-medium text-white shadow-lg shadow-[#5b45ff]/25 transition hover:bg-[#4a35e8] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            Build Automation
          </button>
        </div>
      </div>

      {feedback?.type === 'error' ? (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <span>{feedback.message}</span>
        </div>
      ) : null}

      <FeedbackPopupStack
        items={[
          ...(feedback?.type === 'success'
            ? [
                {
                  id: 'visual-builder-success',
                  tone: 'success' as const,
                  message: feedback.message,
                  onDismiss: () => setFeedback(null),
                },
              ]
            : []),
        ]}
      />

      <AutomationRulesTable
        rules={rules}
        isLoading={isLoading}
        isSaving={isSaving}
        onBuild={openBuilderForCreate}
        onRefresh={() => {
          void loadRules();
          void loadFlows();
        }}
        onEdit={openBuilderForRule}
        onDuplicate={(rule) => void handleDuplicate(rule)}
        onDelete={setPendingDeleteRule}
        onToggleStatus={(rule) => void handleToggleStatus(rule)}
      />

      <ConfirmationDialog
        isOpen={Boolean(pendingDeleteRule)}
        title="Delete automation?"
        description={
          pendingDeleteRule
            ? `The automation "${getAutomationRuleTitle(pendingDeleteRule)}" will be permanently removed.`
            : ''
        }
        confirmLabel="Delete automation"
        isLoading={isSaving}
        onClose={() => {
          if (!isSaving) {
            setPendingDeleteRule(null);
          }
        }}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
