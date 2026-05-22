import { clientConfig } from './config';
import { getCachedSession } from './supabase';
import type {
  ContactUpdateInput,
  ContactUpsertInput,
  ConnectInstagramBusinessLoginInput,
  ConnectMessengerManualInput,
  ConnectMessengerPageLoginInput,
  CreateWalletTopupInput,
  CreateWalletTopupResponse,
  CreateBillingSubscriptionInput,
  CreateBillingSubscriptionResponse,
  ConversationMessage,
  ConversationThread,
  CreateTemplateInput,
  DashboardBootstrap,
  DeveloperApiCredential,
  DeveloperApiCredentialCreateInput,
  DeveloperWebhookCreateInput,
  DeveloperWebhookEndpoint,
  DeveloperWebhookUpdateInput,
  EmailCampaign,
  EmailCampaignSendInput,
  EmailConnectionSummary,
  EmailConnectionUpsertInput,
  EmailConnectionVerifyResponse,
  EmailMessage,
  EmailTemplate,
  EmailTemplateSaveInput,
  BillingPlansResponse,
  BillingQuoteInput,
  BillingQuoteResponse,
  EmbeddedMetaConnectionInput,
  InstagramConnectableAccount,
  InboxInsightsFilters,
  InboxInsightsResponse,
  InstagramConnectionOptionsInput,
  RequestMetaVerificationCodeInput,
  RegisterMetaSenderInput,
  LaunchMarketingCampaignInput,
  LaunchMarketingCampaignResponse,
  UpdateMetaTwoStepVerificationInput,
  VerifyMetaVerificationCodeInput,
  MessengerConnectablePage,
  MessengerConnectionOptionsInput,
  ManualMetaConnectionInput,
  MetaAdsCampaignFilters,
  MetaAdsCampaignsResponse,
  MetaAdsCampaignStatusUpdateInput,
  MetaAdsCampaignStatusUpdateResponse,
  MetaAdsCreationSetupResponse,
  MetaAdsIntegrationOptionsInput,
  MetaAdsIntegrationSaveInput,
  MetaAdsIntegrationSetupResponse,
  MetaCatalogCreateInput,
  MetaCatalogConnectionInput,
  MetaCatalogItemsBatchInput,
  MetaCatalogListResponse,
  MetaCatalogProductsResponse,
  MetaCatalogSelectionInput,
  MetaCatalogSummary,
  MetaCatalogWebhookSetupResponse,
  MetaAdsMediaLibraryResponse,
  MetaLeadCaptureConnectionInput,
  MetaLeadCaptureSetupInput,
  MetaLeadCaptureSetupResponse,
  MetaOAuthCodeExchangeInput,
  MetaOAuthCodeExchangeResponse,
  NotificationPreferences,
  NotificationPreferencesUpdateInput,
  MetaTemplate,
  ProfileUpsertInput,
  InviteWorkspaceUserInput,
  UpdateWorkspaceTeamMemberInput,
  WhatsAppBlockedUsersMutationResponse,
  WhatsAppBlockedUsersResponse,
  WhatsAppCallManageInput,
  WhatsAppCallManageResponse,
  WhatsAppCallPermissionResponse,
  WhatsAppCallSettings,
  WhatsAppCallSettingsUpdateInput,
  SendCallPermissionRequestInput,
  SendCallPermissionRequestResponse,
  SendMediaMessageInput,
  SendTemplateMessageInput,
  SendTextMessageInput,
  SendWhatsAppMessageInput,
  VerifyBillingSubscriptionInput,
  VerifyWalletTopupInput,
  WhatsAppBusinessProfile,
  WhatsAppBusinessActivitiesFilters,
  WhatsAppBusinessActivitiesResponse,
  WhatsAppDisplayNameUpdateInput,
  WhatsAppBusinessProfileUpdateInput,
  AutomationRule,
  AutomationRuleInput,
  WhatsAppFlow,
  WhatsAppFlowInput,
  WhatsAppFlowUpdateInput,
  WhatsAppConversationalAutomationConfig,
  WhatsAppConversationalAutomationUpdateInput,
  WhatsAppOfficialBusinessAccountStatus,
  WhatsAppOfficialBusinessAccountUpdateInput,
  WhatsAppOfficialBusinessAccountUpdateResponse,
  WorkspaceTeamMember,
  WorkspaceOptionDefinition,
  WorkspaceOptionInput,
  WhatsAppCommerceSettings,
  WhatsAppCommerceSettingsUpdateInput,
  WooCommerceAutomationSetting,
  WooCommerceConnectionInput,
  WooCommerceConnectionVerifyInput,
  WooCommerceConnectionVerifyResponse,
  WooCommerceSetupResponse,
} from './types';

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export const DASHBOARD_API_ERROR_EVENT = 'connektly:api-error';

export interface DashboardApiErrorEventDetail {
  id: string;
  message: string;
  status: number;
  method: string;
  path: string;
  occurredAt: number;
}

async function getAuthHeaders() {
  const session = await getCachedSession();
  const token = session?.access_token;

  return token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {};
}

function getRequestMethod(init?: RequestInit) {
  return (init?.method || 'GET').toUpperCase();
}

function shouldBroadcastApiError(init?: RequestInit) {
  const method = getRequestMethod(init);
  return method !== 'GET' && method !== 'HEAD';
}

function broadcastApiError(path: string, init: RequestInit | undefined, error: ApiError) {
  if (typeof window === 'undefined' || !shouldBroadcastApiError(init)) {
    return;
  }

  const detail: DashboardApiErrorEventDetail = {
    id: `${Date.now()}:${Math.random().toString(36).slice(2)}`,
    message: error.message,
    status: error.status,
    method: getRequestMethod(init),
    path,
    occurredAt: Date.now(),
  };

  window.dispatchEvent(new CustomEvent(DASHBOARD_API_ERROR_EVENT, { detail }));
}

async function throwApiErrorResponse(path: string, response: Response, init?: RequestInit): Promise<never> {
  const fallbackMessage = `Request failed with status ${response.status}`;
  let apiError: ApiError;

  try {
    const payload = await response.json();
    apiError = new ApiError(payload.error || fallbackMessage, response.status);
  } catch (error) {
    apiError = error instanceof ApiError
      ? error
      : new ApiError(fallbackMessage, response.status);
  }

  broadcastApiError(path, init, apiError);
  throw apiError;
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(`${clientConfig.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...init?.headers,
    },
  });

  if (!response.ok) {
    return throwApiErrorResponse(path, response, init);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

async function apiBlobRequest(
  path: string,
  init?: RequestInit,
): Promise<{ blob: Blob; filename: string | null; contentType: string | null }> {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(`${clientConfig.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...authHeaders,
      ...init?.headers,
    },
  });

  if (!response.ok) {
    return throwApiErrorResponse(path, response, init);
  }

  const disposition = response.headers.get('content-disposition');
  const filenameMatch = disposition?.match(/filename="?([^"]+)"?/i);

  return {
    blob: await response.blob(),
    filename: filenameMatch?.[1] || null,
    contentType: response.headers.get('content-type'),
  };
}

export const appApi = {
  requestPasswordResetEmail(payload: { email: string; redirectTo: string; captchaToken?: string }) {
    return apiRequest<{ ok: true }>('/auth/password-reset', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getBootstrap() {
    return apiRequest<DashboardBootstrap>('/bootstrap');
  },
  saveProfile(payload: ProfileUpsertInput) {
    return apiRequest<{ profile: DashboardBootstrap['profile'] }>('/profile', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  deleteAccount() {
    return apiRequest<{ ok: true }>('/account', {
      method: 'DELETE',
    });
  },
  getDeveloperApiCredentials() {
    return apiRequest<{ credentials: DeveloperApiCredential[] }>('/developer/api-credentials');
  },
  createDeveloperApiCredential(payload: DeveloperApiCredentialCreateInput) {
    return apiRequest<{ credential: DeveloperApiCredential; secret: string }>(
      '/developer/api-credentials',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },
  regenerateDeveloperApiCredentialSecret(credentialId: string) {
    return apiRequest<{ credential: DeveloperApiCredential; secret: string }>(
      `/developer/api-credentials/${encodeURIComponent(credentialId)}/secret`,
      {
        method: 'POST',
      },
    );
  },
  deleteDeveloperApiCredential(credentialId: string) {
    return apiRequest<{ ok: true }>(
      `/developer/api-credentials/${encodeURIComponent(credentialId)}`,
      {
        method: 'DELETE',
      },
    );
  },
  getDeveloperWebhooks() {
    return apiRequest<{ webhooks: DeveloperWebhookEndpoint[] }>('/developer/webhooks');
  },
  createDeveloperWebhook(payload: DeveloperWebhookCreateInput) {
    return apiRequest<{ webhook: DeveloperWebhookEndpoint; signingSecret: string }>(
      '/developer/webhooks',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },
  updateDeveloperWebhook(webhookId: string, payload: DeveloperWebhookUpdateInput) {
    return apiRequest<{ webhook: DeveloperWebhookEndpoint }>(
      `/developer/webhooks/${encodeURIComponent(webhookId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
    );
  },
  deleteDeveloperWebhook(webhookId: string) {
    return apiRequest<{ ok: true }>(`/developer/webhooks/${encodeURIComponent(webhookId)}`, {
      method: 'DELETE',
    });
  },
  async uploadProfilePhoto(file: File) {
    const authHeaders = await getAuthHeaders();
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${clientConfig.apiBaseUrl}/profile/photo`, {
      method: 'POST',
      headers: authHeaders,
      body: formData,
    });

    if (!response.ok) {
      return throwApiErrorResponse('/profile/photo', response, { method: 'POST' });
    }

    return response.json() as Promise<{ profile: DashboardBootstrap['profile'] }>;
  },
  async uploadCompanyLogo(file: File) {
    const authHeaders = await getAuthHeaders();
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${clientConfig.apiBaseUrl}/profile/company-logo`, {
      method: 'POST',
      headers: authHeaders,
      body: formData,
    });

    if (!response.ok) {
      return throwApiErrorResponse('/profile/company-logo', response, { method: 'POST' });
    }

    return response.json() as Promise<{ profile: DashboardBootstrap['profile'] }>;
  },
  getTeamMembers() {
    return apiRequest<{ members: WorkspaceTeamMember[] }>('/team/members');
  },
  inviteTeamMember(payload: InviteWorkspaceUserInput) {
    return apiRequest<{ member: WorkspaceTeamMember; inviteSent: boolean }>('/team/invite', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateTeamMember(memberId: string, payload: UpdateWorkspaceTeamMemberInput) {
    return apiRequest<{ member: WorkspaceTeamMember }>(`/team/members/${encodeURIComponent(memberId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  removeTeamMember(memberId: string) {
    return apiRequest<{ ok: true }>(`/team/members/${encodeURIComponent(memberId)}`, {
      method: 'DELETE',
    });
  },
  getWorkspaceOptions() {
    return apiRequest<{ options: WorkspaceOptionDefinition[] }>('/workspace/options', {
      cache: 'no-store',
    });
  },
  createWorkspaceOption(payload: WorkspaceOptionInput) {
    return apiRequest<{ option: WorkspaceOptionDefinition }>('/workspace/options', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  deleteWorkspaceOption(optionId: string) {
    return apiRequest<{ ok: true }>(`/workspace/options/${encodeURIComponent(optionId)}`, {
      method: 'DELETE',
    });
  },
  startFreeTrial() {
    return apiRequest<{ profile: DashboardBootstrap['profile'] }>('/billing/trial/start', {
      method: 'POST',
    });
  },
  getBillingPlans() {
    return apiRequest<BillingPlansResponse>('/billing/plans', {
      cache: 'no-store',
    });
  },
  getBillingQuote(payload: BillingQuoteInput) {
    return apiRequest<BillingQuoteResponse>('/billing/quote', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  createBillingSubscription(payload: CreateBillingSubscriptionInput) {
    return apiRequest<CreateBillingSubscriptionResponse>('/billing/subscription', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  verifyBillingSubscription(payload: VerifyBillingSubscriptionInput) {
    return apiRequest<{ profile: DashboardBootstrap['profile'] }>('/billing/subscription/verify', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  createWalletTopup(payload: CreateWalletTopupInput) {
    return apiRequest<CreateWalletTopupResponse>('/wallet/topup', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  verifyWalletTopup(payload: VerifyWalletTopupInput) {
    return apiRequest<{ wallet: DashboardBootstrap['wallet'] }>('/wallet/topup/verify', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  connectMetaManually(payload: ManualMetaConnectionInput) {
    return apiRequest<{ channel: DashboardBootstrap['channel'] }>('/meta/connect/manual', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  connectMetaEmbedded(payload: EmbeddedMetaConnectionInput) {
    return apiRequest<{ channel: DashboardBootstrap['channel'] }>('/meta/connect/embedded', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  exchangeMetaOAuthCode(payload: MetaOAuthCodeExchangeInput) {
    return apiRequest<MetaOAuthCodeExchangeResponse>('/meta/oauth/exchange', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  disconnectMetaChannel() {
    return apiRequest<{ ok: true }>('/meta/channel', {
      method: 'DELETE',
    });
  },
  registerMetaSender(payload: RegisterMetaSenderInput = {}) {
    return apiRequest<{ channel: DashboardBootstrap['channel'] }>('/meta/channel/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateMetaTwoStepVerification(payload: UpdateMetaTwoStepVerificationInput) {
    return apiRequest<{ channel: DashboardBootstrap['channel'] }>(
      '/meta/channel/two-step-verification',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },
  requestMetaVerificationCode(payload: RequestMetaVerificationCodeInput) {
    return apiRequest<{ channel: DashboardBootstrap['channel'] }>(
      '/meta/channel/request-code',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },
  verifyMetaVerificationCode(payload: VerifyMetaVerificationCodeInput) {
    return apiRequest<{ channel: DashboardBootstrap['channel'] }>(
      '/meta/channel/verify-code',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },
  deregisterMetaSender() {
    return apiRequest<{ channel: DashboardBootstrap['channel'] }>('/meta/channel/deregister', {
      method: 'POST',
    });
  },
  checkWhatsAppWebhookSubscription() {
    return apiRequest<{ channel: DashboardBootstrap['channel'] }>('/meta/channel/webhook-subscription');
  },
  subscribeWhatsAppWebhook() {
    return apiRequest<{ channel: DashboardBootstrap['channel'] }>('/meta/channel/webhook-subscription', {
      method: 'POST',
    });
  },
  unsubscribeWhatsAppWebhook() {
    return apiRequest<{ channel: DashboardBootstrap['channel'] }>('/meta/channel/webhook-subscription', {
      method: 'DELETE',
    });
  },
  getInstagramConnectionOptions(payload: InstagramConnectionOptionsInput) {
    return apiRequest<{ accounts: InstagramConnectableAccount[] }>('/instagram/connect/options', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  connectInstagramBusinessLogin(payload: ConnectInstagramBusinessLoginInput) {
    return apiRequest<{ channel: DashboardBootstrap['instagramChannel'] }>(
      '/instagram/connect/business-login',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },
  disconnectInstagramChannel() {
    return apiRequest<{ ok: true }>('/instagram/channel', {
      method: 'DELETE',
    });
  },
  subscribeInstagramWebhook() {
    return apiRequest<{ channel: DashboardBootstrap['instagramChannel'] }>('/instagram/channel/webhook-subscription', {
      method: 'POST',
    });
  },
  getMessengerConnectionOptions(payload: MessengerConnectionOptionsInput) {
    return apiRequest<{ pages: MessengerConnectablePage[] }>('/messenger/connect/options', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  connectMessengerPageLogin(payload: ConnectMessengerPageLoginInput) {
    return apiRequest<{ channel: DashboardBootstrap['messengerChannel'] }>(
      '/messenger/connect/facebook-login',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },
  connectMessengerManually(payload: ConnectMessengerManualInput) {
    return apiRequest<{ channel: DashboardBootstrap['messengerChannel'] }>(
      '/messenger/connect/manual',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },
  disconnectMessengerChannel() {
    return apiRequest<{ ok: true }>('/messenger/channel', {
      method: 'DELETE',
    });
  },
  syncTemplates() {
    return apiRequest<{ templates: MetaTemplate[] }>('/meta/templates/sync', {
      method: 'POST',
    });
  },
  createTemplate(payload: CreateTemplateInput) {
    return apiRequest<{ template: MetaTemplate }>('/meta/templates', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  duplicateTemplate(templateId: string) {
    return apiRequest<{ template: MetaTemplate }>(`/meta/templates/${templateId}/duplicate`, {
      method: 'POST',
    });
  },
  deleteTemplate(templateId: string) {
    return apiRequest<void>(`/meta/templates/${templateId}`, {
      method: 'DELETE',
    });
  },
  getFlows() {
    return apiRequest<{ flows: WhatsAppFlow[] }>('/meta/flows', {
      cache: 'no-store',
    });
  },
  createFlow(payload: WhatsAppFlowInput) {
    return apiRequest<{ flow: WhatsAppFlow }>('/meta/flows', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateFlow(flowId: string, payload: WhatsAppFlowUpdateInput) {
    return apiRequest<{ flow: WhatsAppFlow }>(`/meta/flows/${flowId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  publishFlow(flowId: string) {
    return apiRequest<{ flow: WhatsAppFlow }>(`/meta/flows/${flowId}/publish`, {
      method: 'POST',
    });
  },
  getFlowPreview(flowId: string) {
    return apiRequest<{ flow: WhatsAppFlow }>(`/meta/flows/${flowId}/preview`, {
      method: 'POST',
    });
  },
  deleteFlow(flowId: string) {
    return apiRequest<void>(`/meta/flows/${flowId}`, {
      method: 'DELETE',
    });
  },
  getMessages(threadId: string, options?: { markRead?: boolean }) {
    const markRead = options?.markRead ?? true;
    const query = markRead ? '' : '?markRead=false';

    return apiRequest<{
      thread: DashboardBootstrap['conversations'][number];
      messages: ConversationMessage[];
    }>(`/conversations/${threadId}${query}`, {
      cache: 'no-store',
    });
  },
  sendTextMessage(threadId: string, payload: SendTextMessageInput) {
    return apiRequest<{ ok: true; thread: ConversationThread; message: ConversationMessage }>(
      `/conversations/${threadId}/messages/text`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },
  sendMediaMessage(threadId: string, payload: SendMediaMessageInput) {
    return apiRequest<{ ok: true; thread: ConversationThread; message: ConversationMessage }>(
      `/conversations/${threadId}/messages/media`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },
  sendWhatsAppMessage(threadId: string, payload: SendWhatsAppMessageInput) {
    return apiRequest<{ ok: true; thread: ConversationThread; message: ConversationMessage }>(
      `/conversations/${threadId}/messages`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },
  sendTemplateMessage(payload: SendTemplateMessageInput) {
    return apiRequest<{ ok: true; threadId: string; thread: ConversationThread; message: ConversationMessage }>(
      '/conversations/template-message',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },
  launchMarketingCampaign(payload: LaunchMarketingCampaignInput) {
    return apiRequest<LaunchMarketingCampaignResponse>('/campaigns/marketing-message', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  startConversation(payload: SendTemplateMessageInput & { contactName?: string }) {
    return apiRequest<{ ok: true; threadId: string; thread: ConversationThread; message: ConversationMessage }>(
      '/conversations/start',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },
  createContact(payload: ContactUpsertInput) {
    return apiRequest<{ contact: DashboardBootstrap['conversations'][number] }>('/contacts', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateContact(threadId: string, payload: ContactUpdateInput) {
    return apiRequest<{ contact: DashboardBootstrap['conversations'][number] }>(`/contacts/${threadId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  deleteContact(threadId: string) {
    return apiRequest<void>(`/contacts/${threadId}`, {
      method: 'DELETE',
    });
  },
  getEmailConnection() {
    return apiRequest<{ connection: EmailConnectionSummary | null }>('/email/connection', {
      cache: 'no-store',
    });
  },
  verifyEmailConnection(payload: EmailConnectionUpsertInput) {
    return apiRequest<EmailConnectionVerifyResponse>('/email/connection/verify', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  saveEmailConnection(payload: EmailConnectionUpsertInput) {
    return apiRequest<{ connection: EmailConnectionSummary }>('/email/connection', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  deleteEmailConnection() {
    return apiRequest<{ ok: true }>('/email/connection', {
      method: 'DELETE',
    });
  },
  getEmailInbox() {
    return apiRequest<{ messages: EmailMessage[] }>('/email/inbox', {
      cache: 'no-store',
    });
  },
  getEmailTemplates() {
    return apiRequest<{ templates: EmailTemplate[] }>('/email/templates', {
      cache: 'no-store',
    });
  },
  saveEmailTemplate(payload: EmailTemplateSaveInput) {
    return apiRequest<{ template: EmailTemplate }>('/email/templates', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  deleteEmailTemplate(templateId: string) {
    return apiRequest<{ ok: true }>(`/email/templates/${templateId}`, {
      method: 'DELETE',
    });
  },
  getEmailCampaigns() {
    return apiRequest<{ campaigns: EmailCampaign[] }>('/email/campaigns', {
      cache: 'no-store',
    });
  },
  sendEmailCampaign(payload: EmailCampaignSendInput) {
    return apiRequest<{ campaign: EmailCampaign }>('/email/campaigns/send', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  markNotificationsRead(payload: { notificationId?: string; markAll?: boolean }) {
    return apiRequest<{ ok: true }>('/notifications/read', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  saveNotificationPreferences(payload: NotificationPreferencesUpdateInput) {
    return apiRequest<{ preferences: NotificationPreferences }>('/notifications/preferences', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getBusinessProfile() {
    return apiRequest<{ profile: WhatsAppBusinessProfile }>('/meta/business-profile');
  },
  getOfficialBusinessAccountStatus(options?: { force?: boolean }) {
    const query = options?.force ? '?force=true' : '';
    return apiRequest<{ status: WhatsAppOfficialBusinessAccountStatus }>(
      `/meta/official-business-account${query}`,
      {
        cache: 'no-store',
      },
    );
  },
  submitOfficialBusinessAccountUpdate(payload: WhatsAppOfficialBusinessAccountUpdateInput) {
    return apiRequest<WhatsAppOfficialBusinessAccountUpdateResponse>('/meta/official-business-account', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getWhatsAppCommerceSettings() {
    return apiRequest<{ settings: WhatsAppCommerceSettings }>('/meta/commerce-settings', {
      cache: 'no-store',
    });
  },
  getMetaCatalogWebhookSetup() {
    return apiRequest<MetaCatalogWebhookSetupResponse>('/meta/catalog/setup', {
      cache: 'no-store',
    });
  },
  getMetaCatalogs() {
    return apiRequest<MetaCatalogListResponse>('/meta/catalogs', {
      cache: 'no-store',
    });
  },
  connectMetaCatalog(payload: MetaCatalogConnectionInput) {
    return apiRequest<MetaCatalogListResponse>('/meta/catalog/connect', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  createMetaCatalog(payload: MetaCatalogCreateInput) {
    return apiRequest<{ catalog: MetaCatalogSummary; selectedCatalogId: string | null }>('/meta/catalogs', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  selectMetaCatalog(payload: MetaCatalogSelectionInput) {
    return apiRequest<{ selectedCatalogId: string | null }>('/meta/catalogs/select', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getMetaCatalogProducts(catalogId: string) {
    return apiRequest<MetaCatalogProductsResponse>(`/meta/catalogs/${encodeURIComponent(catalogId)}/products`, {
      cache: 'no-store',
    });
  },
  saveMetaCatalogItemsBatch(catalogId: string, payload: MetaCatalogItemsBatchInput) {
    return apiRequest<MetaCatalogProductsResponse>(`/meta/catalogs/${encodeURIComponent(catalogId)}/items-batch`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateWhatsAppCommerceSettings(payload: WhatsAppCommerceSettingsUpdateInput) {
    return apiRequest<{ settings: WhatsAppCommerceSettings }>('/meta/commerce-settings', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getCallSettings() {
    return apiRequest<{ settings: WhatsAppCallSettings }>('/meta/call-settings', {
      cache: 'no-store',
    });
  },
  updateCallSettings(payload: WhatsAppCallSettingsUpdateInput) {
    return apiRequest<{ settings: WhatsAppCallSettings }>('/meta/call-settings', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getConversationalAutomation() {
    return apiRequest<{ config: WhatsAppConversationalAutomationConfig }>('/meta/conversational-automation');
  },
  updateConversationalAutomation(payload: WhatsAppConversationalAutomationUpdateInput) {
    return apiRequest<{ config: WhatsAppConversationalAutomationConfig }>('/meta/conversational-automation', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getAutomationRules() {
    return apiRequest<{ rules: AutomationRule[] }>('/automations/rules', {
      cache: 'no-store',
    });
  },
  updateAutomationRules(payload: { rules: AutomationRuleInput[] }) {
    return apiRequest<{ rules: AutomationRule[] }>('/automations/rules', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getCallPermissions(userWaId: string) {
    const query = new URLSearchParams({
      userWaId,
    });

    return apiRequest<WhatsAppCallPermissionResponse>(`/calls/permissions?${query.toString()}`);
  },
  requestCallPermission(payload: SendCallPermissionRequestInput) {
    return apiRequest<SendCallPermissionRequestResponse>('/calls/permissions/request', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getBlockedUsers() {
    return apiRequest<WhatsAppBlockedUsersResponse>('/whatsapp/blocked-users', {
      cache: 'no-store',
    });
  },
  blockUsers(users: string[]) {
    return apiRequest<WhatsAppBlockedUsersMutationResponse>('/whatsapp/blocked-users', {
      method: 'POST',
      body: JSON.stringify({ users }),
    });
  },
  unblockUsers(users: string[]) {
    return apiRequest<WhatsAppBlockedUsersMutationResponse>('/whatsapp/blocked-users', {
      method: 'DELETE',
      body: JSON.stringify({ users }),
    });
  },
  manageCall(payload: WhatsAppCallManageInput) {
    return apiRequest<WhatsAppCallManageResponse>('/calls', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getInboxInsights(filters: InboxInsightsFilters) {
    const query = new URLSearchParams({
      startDate: filters.startDate,
      endDate: filters.endDate,
      channel: filters.channel,
    });

    return apiRequest<InboxInsightsResponse>(`/insights/inbox?${query.toString()}`);
  },
  getMetaLeadCaptureSetup() {
    return apiRequest<MetaLeadCaptureSetupResponse>('/integrations/meta-lead-capture');
  },
  saveMetaLeadCaptureSetup(payload: MetaLeadCaptureSetupInput) {
    return apiRequest<MetaLeadCaptureSetupResponse>('/integrations/meta-lead-capture', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  connectMetaLeadCapture(payload: MetaLeadCaptureConnectionInput) {
    return apiRequest<MetaLeadCaptureSetupResponse>('/integrations/meta-lead-capture/connect', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  subscribeMetaLeadCapturePages() {
    return apiRequest<MetaLeadCaptureSetupResponse>('/integrations/meta-lead-capture/subscribe-pages', {
      method: 'POST',
    });
  },
  getMetaAdsIntegrationSetup() {
    return apiRequest<MetaAdsIntegrationSetupResponse>('/integrations/meta-ads', {
      cache: 'no-store',
    });
  },
  getMetaAdsIntegrationOptions(payload: MetaAdsIntegrationOptionsInput) {
    return apiRequest<MetaAdsIntegrationSetupResponse>('/integrations/meta-ads/options', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  saveMetaAdsIntegration(payload: MetaAdsIntegrationSaveInput) {
    return apiRequest<MetaAdsIntegrationSetupResponse>('/integrations/meta-ads', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  disconnectMetaAdsIntegration() {
    return apiRequest<MetaAdsIntegrationSetupResponse>('/integrations/meta-ads', {
      method: 'DELETE',
    });
  },
  getMetaAdsCampaigns(filters: MetaAdsCampaignFilters = {}) {
    const query = new URLSearchParams();

    if (filters.period) {
      query.set('period', filters.period);
    }

    if (filters.since) {
      query.set('since', filters.since);
    }

    if (filters.until) {
      query.set('until', filters.until);
    }

    const suffix = query.toString() ? `?${query.toString()}` : '';
    return apiRequest<MetaAdsCampaignsResponse>(`/meta-ads/campaigns${suffix}`, {
      cache: 'no-store',
    });
  },
  updateMetaAdsCampaignStatus(campaignId: string, payload: MetaAdsCampaignStatusUpdateInput) {
    return apiRequest<MetaAdsCampaignStatusUpdateResponse>(
      `/meta-ads/campaigns/${encodeURIComponent(campaignId)}/status`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },
  getMetaAdsMediaLibrary() {
    return apiRequest<MetaAdsMediaLibraryResponse>('/meta-ads/media', {
      cache: 'no-store',
    });
  },
  getMetaAdsCreationSetup() {
    return apiRequest<MetaAdsCreationSetupResponse>('/meta-ads/create/setup', {
      cache: 'no-store',
    });
  },
  getWooCommerceSetup() {
    return apiRequest<WooCommerceSetupResponse>('/integrations/woocommerce', {
      cache: 'no-store',
    });
  },
  verifyWooCommerceConnection(payload: WooCommerceConnectionVerifyInput) {
    return apiRequest<WooCommerceConnectionVerifyResponse>('/integrations/woocommerce/verify', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  saveWooCommerceConnection(payload: WooCommerceConnectionInput) {
    return apiRequest<WooCommerceSetupResponse & { webhookSecret?: string }>(
      '/integrations/woocommerce',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },
  updateWooCommerceAutomations(automations: WooCommerceAutomationSetting[]) {
    return apiRequest<WooCommerceSetupResponse>('/integrations/woocommerce/automations', {
      method: 'PATCH',
      body: JSON.stringify({ automations }),
    });
  },
  disconnectWooCommerceConnection() {
    return apiRequest<{ ok: true }>('/integrations/woocommerce', {
      method: 'DELETE',
    });
  },
  getWhatsAppBusinessActivities(filters: WhatsAppBusinessActivitiesFilters) {
    const query = new URLSearchParams();

    if (typeof filters.limit === 'number' && Number.isFinite(filters.limit)) {
      query.set('limit', String(filters.limit));
    }

    if (filters.after) {
      query.set('after', filters.after);
    }

    if (filters.before) {
      query.set('before', filters.before);
    }

    if (filters.since) {
      query.set('since', filters.since);
    }

    if (filters.until) {
      query.set('until', filters.until);
    }

    if (Array.isArray(filters.activityType) && filters.activityType.length > 0) {
      query.set('activityType', filters.activityType.join(','));
    }

    const suffix = query.size > 0 ? `?${query.toString()}` : '';
    return apiRequest<WhatsAppBusinessActivitiesResponse>(`/developer/whatsapp-activities${suffix}`, {
      cache: 'no-store',
    });
  },
  updateWhatsAppDisplayName(payload: WhatsAppDisplayNameUpdateInput) {
    return apiRequest<{ profile: WhatsAppBusinessProfile }>('/meta/display-name', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateBusinessProfile(payload: WhatsAppBusinessProfileUpdateInput) {
    return apiRequest<{ profile: WhatsAppBusinessProfile }>('/meta/business-profile', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  async uploadBusinessProfilePhoto(file: File) {
    const authHeaders = await getAuthHeaders();
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${clientConfig.apiBaseUrl}/meta/business-profile/photo`, {
      method: 'POST',
      headers: authHeaders,
      body: formData,
    });

    if (!response.ok) {
      return throwApiErrorResponse('/meta/business-profile/photo', response, { method: 'POST' });
    }

    return response.json() as Promise<{ profile: WhatsAppBusinessProfile }>;
  },
  async uploadMedia(file: File) {
    const authHeaders = await getAuthHeaders();
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${clientConfig.apiBaseUrl}/media/upload`, {
      method: 'POST',
      headers: authHeaders,
      body: formData,
    });

    if (!response.ok) {
      return throwApiErrorResponse('/media/upload', response, { method: 'POST' });
    }

    return response.json() as Promise<{
      mediaId: string;
      mediaType: SendMediaMessageInput['mediaType'];
      fileName: string;
      mimeType: string;
    }>;
  },
  async uploadTemplateHeaderMedia(file: File) {
    const authHeaders = await getAuthHeaders();
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${clientConfig.apiBaseUrl}/meta/templates/header-media`, {
      method: 'POST',
      headers: authHeaders,
      body: formData,
    });

    if (!response.ok) {
      return throwApiErrorResponse('/meta/templates/header-media', response, { method: 'POST' });
    }

    return response.json() as Promise<{
      headerMediaHandle: string;
      headerMediaPreviewUrl: string;
      fileName: string;
      mimeType: string;
    }>;
  },
  downloadMedia(mediaId: string, fileName?: string) {
    const query = fileName ? `?fileName=${encodeURIComponent(fileName)}` : '';
    return apiBlobRequest(`/media/${mediaId}${query}`);
  },
};

export { ApiError };
