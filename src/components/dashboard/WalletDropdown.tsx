import { ArrowUpRight, History, Sparkles, Wallet } from 'lucide-react';
import type { DashboardBootstrap } from '../../lib/types';
import { formatWalletAmount } from '../../lib/wallet';

interface WalletDropdownProps {
  wallet: DashboardBootstrap['wallet'];
  onBuyCredits: () => void;
  onViewHistory: () => void;
}

export default function WalletDropdown({
  wallet,
  onBuyCredits,
  onViewHistory,
}: WalletDropdownProps) {
  return (
    <div className="w-[320px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.18)]">
      <div className="border-b border-gray-100 bg-[radial-gradient(circle_at_top_right,_rgba(91,69,255,0.18),_transparent_48%),linear-gradient(135deg,#111827,_#1f2937)] px-4 py-4 text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">Platform wallet</p>
            <h3 className="mt-2 text-lg font-semibold tracking-tight">
              {formatWalletAmount(wallet.availableBalance, wallet.currency)}
            </h3>
            <p className="mt-1 text-xs text-white/70">
              Campaign budget tracking and future eligible partner-managed billing.
            </p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-white shadow-lg backdrop-blur">
            <Wallet className="h-5 w-5" />
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="rounded-2xl border border-amber-100 bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-900">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span>
              Billing coming soon for eligible partner-managed accounts. Estimated WhatsApp messaging spend remains informational unless billing is enabled for your workspace.
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <a
            href={wallet.pricingOverviewUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
          >
            <span>Meta Pricing Overview</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
          <button
            type="button"
            onClick={onBuyCredits}
            className="inline-flex items-center gap-2 rounded-full bg-[#5b45ff] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#4a35e8]"
          >
            <Wallet className="h-3.5 w-3.5" />
            <span>Buy Credits</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onViewHistory}
          className="flex w-full items-center justify-between rounded-2xl border border-gray-200 px-3 py-3 text-left text-sm font-medium text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
        >
          <span className="flex items-center gap-2">
            <History className="h-4 w-4 text-gray-400" />
            View credit usage history
          </span>
          <ArrowUpRight className="h-4 w-4 text-gray-400" />
        </button>
      </div>
    </div>
  );
}
