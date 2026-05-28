import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowUpRight,
  BadgeIndianRupee,
  Clock3,
  History,
  Loader2,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { useAppData } from '../../context/AppDataContext';
import { appApi } from '../../lib/api';
import { buildPrefillContact, loadRazorpayCheckoutScript, type RazorpayFailurePayload, type RazorpayOrderSuccessPayload } from '../../lib/razorpay';
import { formatWalletAmount, formatWalletDate } from '../../lib/wallet';

function getWalletPurposeLabel(purpose: string) {
  switch (purpose) {
    case 'subscription':
      return 'Subscription';
    case 'addon':
      return 'Wallet top-up';
    case 'campaign_estimate':
      return 'Campaign estimate';
    case 'waba_billing':
      return 'Partner-managed billing';
    default:
      return 'Wallet activity';
  }
}

function getWalletStatusTone(status: string) {
  switch (status) {
    case 'successful':
      return 'bg-emerald-50 text-emerald-700';
    case 'failed':
      return 'bg-red-50 text-red-700';
    case 'refunded':
      return 'bg-amber-50 text-amber-800';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

function getPresetAmounts(currency: string) {
  return currency === 'INR' ? [500, 1000, 2500, 5000] : [25, 50, 100, 250];
}

export default function WalletBilling() {
  const { bootstrap, refresh } = useAppData();
  const wallet = bootstrap?.wallet;
  const profile = bootstrap?.profile;
  const [amount, setAmount] = useState('');
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currency = wallet?.currency || profile?.preferredCurrency || 'USD';
  const presetAmounts = useMemo(() => getPresetAmounts(currency), [currency]);
  const parsedAmount = Number(amount);

  const handleFinalizeTopup = async (
    transactionId: string,
    response: RazorpayOrderSuccessPayload,
  ) => {
    try {
      setIsFinalizing(true);
      setError(null);

      await appApi.verifyWalletTopup({
        transactionId,
        razorpayOrderId: response.razorpay_order_id,
        razorpayPaymentId: response.razorpay_payment_id,
        razorpaySignature: response.razorpay_signature,
      });

      setAmount('');
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Wallet top-up verification failed.');
    } finally {
      setIsCheckingOut(false);
      setIsFinalizing(false);
    }
  };

  const handleBuyCredits = async () => {
    if (!wallet) {
      return;
    }

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Enter a valid amount to continue.');
      return;
    }

    try {
      setError(null);
      setIsCheckingOut(true);

      const scriptLoaded = await loadRazorpayCheckoutScript();

      if (!scriptLoaded || !window.Razorpay) {
        throw new Error('Razorpay checkout failed to load. Refresh the page and try again.');
      }

      const response = await appApi.createWalletTopup({
        amount: parsedAmount,
        currency: wallet.currency,
      });

      const checkout = new window.Razorpay({
        key: response.keyId,
        order_id: response.orderId,
        name: response.businessName,
        description: 'Connektly platform wallet top-up',
        image: response.businessLogoUrl || undefined,
        amount: Math.round(response.amount * 100),
        currency: response.currency,
        prefill: {
          name: profile?.fullName || undefined,
          email: profile?.email || undefined,
          contact: buildPrefillContact(profile?.countryCode, profile?.phone),
        },
        notes: {
          wallet_type: response.wallet.walletType,
          transaction_id: response.transactionId,
        },
        theme: {
          color: '#1381FF',
        },
        modal: {
          confirm_close: true,
          ondismiss: () => {
            setIsCheckingOut(false);
          },
        },
        handler: (payload: RazorpayOrderSuccessPayload) => {
          void handleFinalizeTopup(response.transactionId, payload);
        },
      });

      checkout.on('payment.failed', (payload: RazorpayFailurePayload) => {
        setIsCheckingOut(false);
        setError(payload.error?.description || payload.error?.reason || 'Razorpay could not complete the payment.');
      });

      checkout.open();
    } catch (nextError) {
      setIsCheckingOut(false);
      setError(nextError instanceof Error ? nextError.message : 'Failed to start wallet checkout.');
    }
  };

  if (!wallet) {
    return null;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="overflow-hidden rounded-[32px] border border-slate-200 bg-[radial-gradient(circle_at_top_right,_rgba(19,129,255,0.22),_transparent_42%),linear-gradient(135deg,#0f172a,_#1e293b)] p-6 text-white shadow-[0_28px_80px_rgba(15,23,42,0.22)]"
        >
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">Wallet & Billing</p>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight">Platform wallet</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                Track platform credits, monitor campaign spend estimates, and keep billing launch-ready without implying direct Meta settlement.
              </p>
            </div>
            <div className="flex items-center gap-3 rounded-[28px] border border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                <Wallet className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-white/50">Available balance</p>
                <p className="mt-1 text-2xl font-semibold">{formatWalletAmount(wallet.availableBalance, wallet.currency)}</p>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/45">Locked balance</p>
              <p className="mt-2 text-lg font-semibold">{formatWalletAmount(wallet.lockedBalance, wallet.currency)}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/45">Wallet type</p>
              <p className="mt-2 text-lg font-semibold capitalize">{wallet.walletType.replace(/_/g, ' ')}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/45">Preferred currency</p>
              <p className="mt-2 text-lg font-semibold">{wallet.preferredCurrency || wallet.currency}</p>
            </div>
          </div>
        </motion.section>

        <motion.section
          id="buy-credits"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1381FF]">Top up</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">Buy credits</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Razorpay funds your Connektly platform wallet. Estimated WhatsApp messaging spend stays informational unless billing is enabled for your account.
              </p>
            </div>
            <BadgeIndianRupee className="h-5 w-5 shrink-0 text-slate-300" />
          </div>

          {error ? (
            <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="mt-6 space-y-4">
            <div className="flex flex-wrap gap-2">
              {presetAmounts.map((presetAmount) => (
                <button
                  key={presetAmount}
                  type="button"
                  onClick={() => {
                    setAmount(String(presetAmount));
                    setError(null);
                  }}
                  className={`rounded-full px-3 py-2 text-sm font-semibold transition ${
                    amount === String(presetAmount)
                      ? 'bg-[#1381FF] text-white'
                      : 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {formatWalletAmount(presetAmount, currency)}
                </button>
              ))}
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Custom amount</span>
              <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4">
                <span className="text-sm font-semibold text-slate-500">{currency}</span>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={amount}
                  onChange={(event) => {
                    setAmount(event.target.value);
                    setError(null);
                  }}
                  placeholder={currency === 'INR' ? '1000' : '50'}
                  className="h-12 w-full bg-transparent px-3 text-sm text-slate-950 outline-none placeholder:text-slate-400"
                />
              </div>
            </label>

            <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
              <div className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  Billing coming soon for eligible partner-managed accounts. This wallet is positioned for platform credits and campaign budget tracking today.
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => void handleBuyCredits()}
                disabled={!wallet.rechargeEnabled || isCheckingOut || isFinalizing}
                className={`inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl text-sm font-semibold transition ${
                  wallet.rechargeEnabled && !isCheckingOut && !isFinalizing
                    ? 'bg-[#1381FF] text-white hover:bg-[#4a35e8]'
                    : 'cursor-not-allowed bg-slate-200 text-slate-500'
                }`}
              >
                {isCheckingOut || isFinalizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                {isFinalizing ? 'Verifying payment' : 'Buy Credits'}
              </button>
              <a
                href={wallet.pricingOverviewUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Meta Pricing Overview
                <ArrowUpRight className="h-4 w-4" />
              </a>
            </div>

            {!wallet.rechargeEnabled ? (
              <p className="text-xs text-slate-500">
                Wallet checkout needs `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` on the API server.
              </p>
            ) : null}
          </div>
        </motion.section>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.9fr,1.1fr]">
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
              <Clock3 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Launch posture</h2>
              <p className="text-sm text-slate-500">Keep the experience mature without crossing billing boundaries.</p>
            </div>
          </div>

          <div className="mt-5 space-y-3 text-sm leading-6 text-slate-600">
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              Campaign budget tracking and estimated WhatsApp messaging spend can be shown today.
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              Direct prepaid WABA billing stays disabled until a compliant partner-managed model is available.
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              Feature flags are already in place for platform wallet, campaign estimator, WABA billing, and partner mode.
            </div>
          </div>
        </motion.section>

        <motion.section
          id="usage-history"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm"
        >
          <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                <History className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Credit usage history</h2>
                <p className="text-sm text-slate-500">Recent wallet activity, top-ups, and future billing events.</p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-left text-xs uppercase tracking-[0.16em] text-slate-500">
                  <th className="px-6 py-4 font-semibold">Activity</th>
                  <th className="px-6 py-4 font-semibold">Date</th>
                  <th className="px-6 py-4 font-semibold">Status</th>
                  <th className="px-6 py-4 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {wallet.transactions.map((transaction) => {
                  const isCredit = transaction.type === 'credit' || transaction.type === 'refund';

                  return (
                    <tr key={transaction.id} className="border-b border-slate-100 align-top">
                      <td className="px-6 py-4">
                        <p className="text-sm font-semibold text-slate-900">{transaction.description}</p>
                        <p className="mt-1 text-xs text-slate-500">{getWalletPurposeLabel(transaction.purpose)}</p>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">{formatWalletDate(transaction.createdAt)}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getWalletStatusTone(transaction.status)}`}>
                          {transaction.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`text-sm font-semibold ${isCredit ? 'text-emerald-600' : 'text-slate-900'}`}>
                          {isCredit ? '+' : '-'}
                          {formatWalletAmount(transaction.amount, transaction.currency)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {wallet.transactions.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-slate-500">
                No wallet activity yet. Your top-ups, adjustments, and campaign estimate entries will appear here.
              </div>
            ) : null}
          </div>
        </motion.section>
      </div>
    </div>
  );
}
