export function whatsappSendPhoneId(args: {
  path: string; method: string; graphHost: string; body?: Record<string, unknown>;
}): string | null {
  if (args.method !== 'POST' || args.graphHost !== 'graph.facebook.com' || args.body?.messaging_product !== 'whatsapp') return null;
  return /^\/?(\d+)\/(?:messages|marketing_messages)\/?$/.exec(args.path)?.[1] || null;
}

/** Serialize locally and claim slots in Postgres so multiple API workers share the limit. */
export function createCoexistenceSendLimiter(options: {
  claim: (phoneId: string) => Promise<{ acquired: boolean; retryAfterMs: number }>;
  sleep?: (milliseconds: number) => Promise<void>;
}) {
  const tails = new Map<string, Promise<void>>();
  const sleep = options.sleep || ((milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  return async (phoneId: string) => {
    const previous = tails.get(phoneId) || Promise.resolve();
    const current = previous.catch(() => {}).then(async () => {
      for (let attempt = 0; attempt < 2400; attempt++) {
        const slot = await options.claim(phoneId);
        if (slot.acquired) return;
        await sleep(Math.max(1, Math.min(1000, slot.retryAfterMs || 50)));
      }
      throw new Error('WhatsApp Business app message throughput is busy. Try again shortly.');
    });
    tails.set(phoneId, current);
    try { await current; }
    finally { if (tails.get(phoneId) === current) tails.delete(phoneId); }
  };
}
