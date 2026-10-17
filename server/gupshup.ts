import crypto from 'node:crypto';

type Json = Record<string, any>;
const record = (v: unknown): v is Json => Boolean(v && typeof v === 'object' && !Array.isArray(v));
export const normalizePartnerPhone = (value: unknown) => String(value || '').replace(/\D/g, '');

/** A callback credential is bound to one channel and one provider app, never a tenant-supplied ID. */
export function gupshupCallbackSecret(secret: string, channelId: string, appId: string) {
  if (!secret) throw new Error('Configure GUPSHUP_WEBHOOK_SECRET before partner onboarding.');
  return crypto.createHmac('sha256', secret).update(`connektly:gupshup:v3:${channelId}:${appId}`).digest('hex');
}
export function verifyGupshupCallbackSecret(supplied: string, expected: string) {
  return /^[a-f0-9]{64}$/.test(supplied) && supplied.length === expected.length
    && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

export function createGupshupClient(config: {
  token: string; partnerId: string; walletName: string;
  fetch?: typeof fetch; timeoutMs?: number;
}) {
  const requestFetch = config.fetch || fetch;
  const appPath = (id: string) => `/partner/app/${encodeURIComponent(id)}`;
  async function request(path: string, options: {
    method?: string; body?: Json; form?: Record<string, string>; multipart?: FormData; rawFormJson?: Json; bearer?: boolean; tokenHeader?: boolean;
  } = {}): Promise<Json> {
    if (!config.token) throw new Error('Configure the server GUPSHUP_PARTNER_TOKEN Universal Token.');
    const response = await requestFetch(`https://partner.gupshup.io${path}`, {
      method: options.method || 'GET', redirect: 'error', signal: AbortSignal.timeout(config.timeoutMs || 30_000),
      headers: { Accept: 'application/json',
        ...(options.tokenHeader ? { token: config.token } : { Authorization: `${options.bearer ? 'Bearer ' : ''}${config.token}` }),
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.form || options.rawFormJson ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      body: options.multipart || (options.body ? JSON.stringify(options.body) : options.form ? new URLSearchParams(options.form) : options.rawFormJson ? JSON.stringify(options.rawFormJson) : undefined),
    });
    let payload: unknown;
    try { payload = await response.json(); } catch {
      throw new Error(`Gupshup returned a non-JSON response (${response.status}). Partner API availability must be confirmed; the operation will not be replayed automatically.`);
    }
    if (!response.ok || !record(payload) || payload.status === 'error' || payload.status === 'failed' || payload.error) {
      // Do not include response bodies: provider errors can contain tokens or customer data.
      throw Object.assign(new Error(`Gupshup could not confirm the operation (${response.status}). Check the partner app and wallet in the Partner Portal.`), { metaStatus: response.status });
    }
    return payload;
  }
  return {
    async blockedUsers(appId: string, method: string, body?: Json, after?: string) {
      if (method === 'GET') return request(`${appPath(appId)}/user/blocklist?${new URLSearchParams({ limit: '100', ...(after ? { after } : {}) })}`);
      if (!['POST', 'DELETE'].includes(method)) throw new Error('Unsupported partner block action.');
      return request(`${appPath(appId)}/user/${method === 'DELETE' ? 'unblock' : 'block'}`, { method: 'POST', body });
    },
    async createApp(input: { name: string; wabaId: string; phone: string }) {
      if (!/^\d+$/.test(config.partnerId) || !config.walletName) throw new Error('Configure GUPSHUP_PARTNER_ID and GUPSHUP_WALLET_NAME.');
      const result = await request(`/partner/bizgate/partner/${config.partnerId}/tpp/app`, {
        method: 'POST', bearer: true,
        body: { ...input, phone: normalizePartnerPhone(input.phone), walletName: config.walletName, force: false },
      });
      if (result.status !== 'success' || !record(result.data) || typeof result.data.appId !== 'string' || !result.data.appId) {
        throw new Error('Gupshup did not confirm the created app ID. Check the Partner Portal before retrying onboarding.');
      }
      return result.data.appId as string;
    },
    async findApps(phone: string) {
      const matches: Json[] = [];
      // The documented phone filter is a contains match; compare full normalized values.
      for (let page = 1; page <= 100; page++) {
        const result = await request(`/partner/app/list?${new URLSearchParams({ phone: normalizePartnerPhone(phone), pageNo: String(page), pageSize: '100' })}`, { tokenHeader: true });
        const rows = result.partnerAppsList || result.apps || result.appList;
        if (!Array.isArray(rows)) throw new Error('Gupshup did not return a verifiable partner app list.');
        matches.push(...rows.filter((row: unknown) => record(row) && normalizePartnerPhone(row.phone) === normalizePartnerPhone(phone)));
        if (rows.length < 100) return matches;
      }
      throw new Error('Gupshup app pagination could not be completed.');
    },
    async details(appId: string) {
      const result = await request(`${appPath(appId)}/details`, { tokenHeader: true });
      const app = record(result.app) ? result.app : result.appDetails;
      if (!record(app) || String(app.id || app.appId) !== appId) throw new Error('Gupshup returned an unexpected app.');
      return app;
    },
    async health(appId: string) {
      const result = await request(`${appPath(appId)}/waba/info`, { bearer: true });
      if (!record(result.wabaInfo)) throw new Error('Gupshup did not confirm WhatsApp account health.');
      return result.wabaInfo;
    },
    async ensureSubscription(appId: string, input: { url: string; tag: string; secret: string }) {
      const path = `${appPath(appId)}/subscription`;
      const existing = await request(path);
      const rows = existing.subscriptions || existing.data;
      if (!Array.isArray(rows)) throw new Error('Gupshup did not return callback subscriptions.');
      const owned = rows.filter((row: Json) => row.tag === input.tag);
      if (owned.length > 1) throw new Error('Multiple Connektly callback subscriptions need review in the Partner Portal.');
      const body = { url: input.url, tag: input.tag, version: '3', modes: 'ALL,READ,DELIVERED,SENT,FAILED,ENQUEUED,BILLING,OTHERS,TEMPLATE,ACCOUNT,COEXISTENCE,FLOWS_MESSAGE', showOnUI: 'false',
        meta: JSON.stringify({ 'X-Gupshup-Webhook-Secret': input.secret }) };
      await request(owned.length ? `${path}/${encodeURIComponent(owned[0].id)}` : path, {
        method: owned.length ? 'PUT' : 'POST', form: body,
      });
      const confirmed = await request(path);
      const saved = (confirmed.subscriptions || confirmed.data || []).filter((row: Json) =>
        row.tag === input.tag && row.url === input.url && Number(row.version) === 3 && row.active === true);
      if (saved.length !== 1) throw new Error('Gupshup has not confirmed the active v3 Connektly callback.');
      let headers: Json;
      try { headers = typeof saved[0].meta === 'string' ? JSON.parse(saved[0].meta) : saved[0].meta; } catch { headers = {}; }
      if (!record(headers) || headers['X-Gupshup-Webhook-Secret'] !== input.secret) throw new Error('Gupshup did not confirm the callback authentication header.');
      return String(saved[0].id);
    },
    async send(appId: string, body: Json, marketing = false) {
      if (body.status === 'read') {
        const result = await request(`${appPath(appId)}/v1/event`, { method: 'POST', rawFormJson: { type: 'message-event', message: body } });
        if (result.status !== 'success') throw new Error('Gupshup did not confirm the read receipt.');
        return { success: true };
      }
      const result = await request(`${appPath(appId)}/${marketing ? 'onboarding/marketing/msg' : 'v3/message'}`, { method: 'POST', body });
      if (!Array.isArray(result.messages) || !result.messages[0]?.id) throw new Error('Gupshup did not confirm a message ID. Do not automatically resend this message.');
      return result;
    },
    async uploadMedia(appId: string, file: { buffer: Uint8Array; mimeType: string; fileName: string }) {
      const form = new FormData();
      form.append('file_type', file.mimeType);
      form.append('file', new Blob([new Uint8Array(file.buffer)], { type: file.mimeType }), file.fileName);
      const result = await request(`${appPath(appId)}/media`, { method: 'POST', multipart: form });
      if (result.status !== 'success' || !result.mediaId) throw new Error('Gupshup did not confirm a media ID.');
      return { id: String(result.mediaId) };
    },
    async downloadMedia(appId: string, mediaId: string) {
      if (!config.token) throw new Error('The Gupshup Universal Token is not configured.');
      const response = await requestFetch(`https://partner.gupshup.io${appPath(appId)}/media/${encodeURIComponent(mediaId)}`, {
        headers: { Authorization: config.token }, redirect: 'error', signal: AbortSignal.timeout(config.timeoutMs || 30_000),
      });
      if (!response.ok || !response.body || response.headers.get('content-type')?.includes('text/html')) {
        throw new Error(`Partner media is unavailable (${response.status}). Check media expiry and the provider download limit.`);
      }
      if (response.headers.get('content-type')?.includes('application/json')) {
        const body = await response.clone().json().catch(() => null);
        if (body?.status === 'error' || body?.status === 'failed') throw new Error('Gupshup could not retrieve this media.');
      }
      return response;
    },
    async sync(appId: string, syncType: string) {
      if (!['smb_app_state_sync', 'history'].includes(syncType)) throw new Error('Invalid coexistence sync type.');
      const result = await request(`${appPath(appId)}/coex/sync`, { method: 'POST', bearer: true, form: { syncType } });
      if (!record(result.data) || !result.data.request_id) throw new Error('Gupshup did not confirm a synchronization request ID.');
      return result.data;
    },
  };
}

/** Fill omissions only after authenticating the app-bound callback. Reject cross-tenant routing. */
export function normalizeGupshupWebhook(payload: Json, channel: Json): Json {
  const appId = channel.metadata?.gupshup?.appId;
  if (!appId || payload.gs_app_id !== appId || !Array.isArray(payload.entry)) throw new Error('Unexpected Gupshup callback app.');
  return { ...payload, entry: payload.entry.map((entry: Json) => {
    // account_update MPS entry.id identifies the provider portfolio, not the WABA.
    return { ...entry, changes: (entry.changes || []).map((change: Json) => {
      if (change.field === 'partner_solutions') throw new Error('Solution lifecycle events require the Meta-signed webhook.');
      const value = record(change.value) ? change.value : {};
      const waba = value.waba_info?.waba_id;
      if ((waba && waba !== channel.waba_id) ||
          ((!waba || change.field !== 'account_update') && entry.id && entry.id !== channel.waba_id) ||
          (value.phone_number_id && value.phone_number_id !== channel.phone_number_id) ||
          (value.metadata?.phone_number_id && value.metadata.phone_number_id !== channel.phone_number_id)) {
        throw new Error('Gupshup callback assets do not match its connected app.');
      }
      return { ...change, value: { ...value, metadata: { ...value.metadata, phone_number_id: channel.phone_number_id } } };
    }), id: entry.changes?.some((c: Json) => c.field === 'account_update') ? entry.id || channel.waba_id : channel.waba_id };
  }) };
}
