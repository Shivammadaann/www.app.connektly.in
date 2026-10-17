import crypto from 'node:crypto';
import type { CoexistenceMessage } from './coexistence-webhooks';

export type CoexistenceWebhookJob = {
  id: string;
  partition_key: string;
  waba_id: string | null;
  phone_number_id: string | null;
  field: string;
  entry_time: string | null;
  payload: Record<string, unknown>;
  attempts: number;
};

export class CoexistenceWebhookRetry extends Error {
  constructor(message: string, public readonly retrySeconds = 60) { super(message); }
}

/** Service-role-only, durable queue; callers acknowledge Meta only after enqueue. */
export function createCoexistenceWebhookQueue(args: {
  supabase: any;
  processJob: (job: CoexistenceWebhookJob, heartbeat: () => Promise<void>) => Promise<void>;
  onError?: (error: unknown) => void;
  workerId?: string;
}) {
  const workerId = args.workerId || crypto.randomUUID();
  let running = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  const table = 'whatsapp_coexistence_webhook_jobs';
  const report = args.onError || ((error: unknown) => console.error('Coexistence webhook worker:', error));
  async function enqueue(input: {
    wabaId: string | null;
    phoneNumberId?: string | null;
    field: string;
    entryTime?: string | null;
    payload: Record<string, unknown>;
    dedupeKey?: string;
  }) {
    const partition = input.phoneNumberId ? `phone:${input.phoneNumberId}` : `waba:${input.wabaId || 'unknown'}`;
    const id = crypto.createHash('sha256').update(input.dedupeKey || JSON.stringify([
      input.wabaId, input.phoneNumberId, input.field, input.entryTime || null, input.payload,
    ])).digest('hex');
    const { error } = await args.supabase.from(table).upsert({
      id, partition_key: partition, waba_id: input.wabaId, phone_number_id: input.phoneNumberId || null,
      field: input.field, entry_time: input.entryTime || null, payload: input.payload,
    }, { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw error;
    return id;
  }
  async function defer(input: { wabaId: string | null; phoneNumberId: string; channelId: string; message: CoexistenceMessage }) {
    return enqueue({
      wabaId: input.wabaId, phoneNumberId: input.phoneNumberId, field: 'coexistence_deferred',
      payload: { channelId: input.channelId, message: input.message },
      dedupeKey: `deferred:${input.channelId}:${input.message.id}:${input.message.mutation?.originalMessageId || ''}:${JSON.stringify(input.message.raw)}`,
    });
  }
  async function drainOnce() {
    if (running) return;
    running = true;
    try {
      // Bound a polling turn so continuous traffic cannot monopolize this worker.
      for (let index = 0; index < 100; index++) {
        const { data, error } = await args.supabase.rpc('claim_whatsapp_coexistence_webhook_job', {
          p_worker_id: workerId, p_lease_seconds: 300,
        });
        if (error) throw error;
        const job = (Array.isArray(data) ? data[0] : data) as CoexistenceWebhookJob | null;
        if (!job) break;
        let lastHeartbeat = Date.now();
        const heartbeat = async () => {
          if (Date.now() - lastHeartbeat < 30_000) return;
          const { data: renewed, error: renewalError } = await args.supabase.rpc('renew_whatsapp_coexistence_webhook_job', {
            p_job_id: job.id, p_worker_id: workerId, p_lease_seconds: 300,
          });
          if (renewalError) throw renewalError;
          if (renewed !== true) throw new CoexistenceWebhookRetry('Webhook processing lease was lost.', 5);
          lastHeartbeat = Date.now();
        };
        let processingError: unknown;
        try { await args.processJob(job, heartbeat); } catch (error) { processingError = error; }
        const retrySeconds = processingError instanceof CoexistenceWebhookRetry ? processingError.retrySeconds :
          Math.min(600, 2 ** Math.min(9, Number(job.attempts || 0)));
        const { error: settleError } = await args.supabase.rpc('finish_whatsapp_coexistence_webhook_job', {
          p_job_id: job.id, p_worker_id: workerId,
          p_error: processingError ? String((processingError as { message?: unknown }).message || processingError).slice(0, 1000) : null,
          p_retry_seconds: retrySeconds,
        });
        if (settleError) throw settleError;
        if (processingError && !(processingError instanceof CoexistenceWebhookRetry)) report(processingError);
      }
    } finally { running = false; }
  }
  const kick = () => { void drainOnce().catch(report); };
  return {
    enqueue, defer, drainOnce, kick,
    start() {
      if (!timer) { timer = setInterval(kick, 15_000); timer.unref?.(); }
      kick();
    },
    stop() { if (timer) clearInterval(timer); timer = undefined; },
  };
}
