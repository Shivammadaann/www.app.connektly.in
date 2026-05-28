import {
  Copy,
  Pencil,
  Plus,
  RefreshCcw,
  Trash2,
  Workflow,
  Zap,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { AutomationRule } from '../../lib/types';
import {
  formatAutomationDateTime,
  getAutomationRuleTitle,
  getVisualTriggerLabel,
} from '../../lib/automation-visual-builder';

function TableSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-[72px] animate-pulse rounded-2xl border border-gray-200 bg-white" />
        ))}
      </div>
      <div className="h-[360px] animate-pulse rounded-2xl border border-gray-200 bg-white" />
    </div>
  );
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
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#1381FF]/10 text-[#1381FF]">
          {icon}
        </div>
      </div>
    </div>
  );
}

function getActionSummary(rule: AutomationRule) {
  if (rule.action.type === 'opt_out_marketing') {
    return 'Opt out of marketing';
  }

  if (rule.action.type === 'send_template') {
    return rule.action.templateName ? `Template: ${rule.action.templateName}` : 'Template message';
  }

  if (rule.action.type === 'send_flow') {
    return rule.action.flowCta ? `Flow: ${rule.action.flowCta}` : 'WhatsApp Flow';
  }

  return 'Custom message';
}

export default function AutomationRulesTable({
  rules,
  isLoading,
  isSaving,
  onBuild,
  onRefresh,
  onEdit,
  onDuplicate,
  onDelete,
  onToggleStatus,
}: {
  rules: AutomationRule[];
  isLoading: boolean;
  isSaving: boolean;
  onBuild: () => void;
  onRefresh: () => void;
  onEdit: (rule: AutomationRule) => void;
  onDuplicate: (rule: AutomationRule) => void;
  onDelete: (rule: AutomationRule) => void;
  onToggleStatus: (rule: AutomationRule) => void;
}) {
  const activeCount = rules.filter((rule) => rule.isEnabled).length;
  const totalExecutions = rules.reduce((total, rule) => total + rule.triggerCount, 0);
  const lastUpdatedAt =
    rules
      .map((rule) => rule.updatedAt || rule.createdAt)
      .filter(Boolean)
      .sort((left, right) => Date.parse(right) - Date.parse(left))[0] || null;

  if (isLoading) {
    return <TableSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-3">
        <StatCard title="Active automations" value={`${activeCount}/${rules.length}`} icon={<Zap className="h-4 w-4" />} />
        <StatCard title="Times executed" value={String(totalExecutions)} icon={<Workflow className="h-4 w-4" />} />
        <StatCard title="Last updated" value={formatAutomationDateTime(lastUpdatedAt)} icon={<RefreshCcw className="h-4 w-4" />} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {rules.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] table-fixed divide-y divide-gray-200">
              <colgroup>
                <col className="w-[27%]" />
                <col className="w-[19%]" />
                <col className="w-[14%]" />
                <col className="w-[10%]" />
                <col className="w-[17%]" />
                <col className="w-[13%]" />
              </colgroup>
              <thead className="bg-gray-50">
                <tr>
                  {['Automation Name', 'Trigger Type', 'Times Executed', 'Status', 'Updated / Created'].map((label) => (
                    <th
                      key={label}
                      className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500"
                    >
                      {label}
                    </th>
                  ))}
                  <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rules.map((rule, index) => (
                  <tr key={rule.id} className="align-middle transition-colors hover:bg-gray-50">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1381FF]/10 text-[#1381FF]">
                          <Workflow className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900">{getAutomationRuleTitle(rule, index)}</p>
                          <p className="mt-1 truncate text-xs text-gray-500">{getActionSummary(rule)}</p>
                          {rule.lastError ? <p className="mt-1 truncate text-xs text-rose-600">{rule.lastError}</p> : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        title={getVisualTriggerLabel(rule.triggerType)}
                        className="inline-block max-w-full truncate rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium leading-5 text-gray-700"
                      >
                        {getVisualTriggerLabel(rule.triggerType)}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-sm font-semibold text-gray-900">{rule.triggerCount}</p>
                      <p className="mt-1 truncate text-xs text-gray-500">
                        Last run: {formatAutomationDateTime(rule.lastTriggeredAt)}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={rule.isEnabled}
                        aria-label={`${rule.isEnabled ? 'Disable' : 'Enable'} ${getAutomationRuleTitle(rule, index)}`}
                        onClick={() => onToggleStatus(rule)}
                        disabled={isSaving}
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1381FF]/30 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
                          rule.isEnabled ? 'border-emerald-400 bg-emerald-500' : 'border-gray-300 bg-gray-200'
                        }`}
                      >
                        <span
                          className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                            rule.isEnabled ? 'translate-x-5' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-sm font-medium text-gray-900">{formatAutomationDateTime(rule.updatedAt)}</p>
                      <p className="mt-1 truncate text-xs text-gray-500">
                        Created {formatAutomationDateTime(rule.createdAt)}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => onEdit(rule)}
                          disabled={isSaving}
                          title="Edit"
                          aria-label={`Edit ${getAutomationRuleTitle(rule, index)}`}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDuplicate(rule)}
                          disabled={isSaving}
                          title="Duplicate"
                          aria-label={`Duplicate ${getAutomationRuleTitle(rule, index)}`}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(rule)}
                          disabled={isSaving}
                          title="Delete"
                          aria-label={`Delete ${getAutomationRuleTitle(rule, index)}`}
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
          <div className="flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#1381FF]/10 text-[#1381FF]">
              <Workflow className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-gray-900">No automations yet</h2>
            <p className="mt-1 max-w-md text-sm text-gray-500">
              Build a visual automation with a trigger, condition, and action sequence.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={onRefresh}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                <RefreshCcw className="h-4 w-4" />
                Refresh
              </button>
              <button
                type="button"
                onClick={onBuild}
                className="inline-flex items-center gap-2 rounded-xl bg-[#1381FF] px-4 py-3 text-sm font-medium text-white shadow-lg shadow-[#1381FF]/25 transition hover:bg-[#4a35e8]"
              >
                <Plus className="h-4 w-4" />
                Build Automation
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
