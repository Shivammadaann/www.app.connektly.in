import type {
  BillingCycle,
  BillingPlanDefinition,
  BillingPlanCode,
  BillingStatus,
  BillingSummary,
} from './billing';
import type { ConversationThreadStatus } from './lead-status';

export type SetupType = 'exclusive' | 'coexistence';
export type ChannelConnectionMethod = 'embedded_signup' | 'manual';
export type InstagramConnectionMethod = 'business_login' | 'instagram_login';
export type MessengerConnectionMethod = 'facebook_login' | 'manual';

export interface AppProfile {
  userId: string;
  email: string | null;
  fullName: string | null;
  profilePictureUrl: string | null;
  companyLogoUrl: string | null;
  countryCode: string | null;
  phone: string | null;
  preferredCurrency: string | null;
  companyName: string | null;
  companyWebsite: string | null;
  industry: string | null;
  selectedPlan: string | null;
  billingCycle: BillingCycle | null;
  billingStatus: BillingStatus | null;
  trialEndsAt: string | null;
  freeTrialStartedAt: string | null;
  couponCode: string | null;
  razorpaySubscriptionId: string | null;
  onboardingCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export type WorkspaceUserRole = 'Owner' | 'Admin' | 'Manager' | 'Agent';
export type WorkspaceUserStatus = 'active' | 'invited';

export interface WorkspaceTeamMember {
  id: string;
  workspaceOwnerUserId: string;
  memberUserId: string | null;
  fullName: string | null;
  email: string;
  profilePictureUrl: string | null;
  role: WorkspaceUserRole;
  status: WorkspaceUserStatus;
  invitedAt: string;
  acceptedAt: string | null;
  isOwner: boolean;
}

export type NotificationType =
  | 'incoming_message'
  | 'incoming_email'
  | 'template_approved'
  | 'template_rejected'
  | 'missed_call'
  | 'lead_created'
  | 'campaign_sent'
  | 'email_campaign_sent'
  | 'display_name_approved'
  | 'display_name_rejected'
  | 'team_member_joined';

export type NotificationSoundPreset = 'classic' | 'soft' | 'pulse';

export interface UserNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  targetPath: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export interface NotificationPreferences {
  userId: string;
  enabled: boolean;
  soundEnabled: boolean;
  callSoundEnabled: boolean;
  soundPreset: NotificationSoundPreset;
  volume: number;
  incomingMessageEnabled: boolean;
  incomingEmailEnabled: boolean;
  templateReviewEnabled: boolean;
  missedCallEnabled: boolean;
  leadEnabled: boolean;
  campaignSentEnabled: boolean;
  emailCampaignEnabled: boolean;
  displayNameApprovedEnabled: boolean;
  teamJoinedEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationPreferencesUpdateInput {
  enabled?: boolean;
  soundEnabled?: boolean;
  callSoundEnabled?: boolean;
  soundPreset?: NotificationSoundPreset;
  volume?: number;
  incomingMessageEnabled?: boolean;
  incomingEmailEnabled?: boolean;
  templateReviewEnabled?: boolean;
  missedCallEnabled?: boolean;
  leadEnabled?: boolean;
  campaignSentEnabled?: boolean;
  emailCampaignEnabled?: boolean;
  displayNameApprovedEnabled?: boolean;
  teamJoinedEnabled?: boolean;
}

export interface MetaChannelConnection {
  id: string;
  userId: string;
  setupType: SetupType | null;
  connectionMethod: ChannelConnectionMethod;
  status: 'connected' | 'pending' | 'error' | 'disconnected';
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
  messagingLimitTier: string | null;
  businessAccountName: string | null;
  accessTokenLast4: string | null;
  connectedAt: string;
  lastSyncedAt: string | null;
  metadata: Record<string, unknown>;
}

export interface InstagramChannelConnection {
  id: string;
  userId: string;
  connectionMethod: InstagramConnectionMethod;
  status: 'connected' | 'pending' | 'error' | 'disconnected';
  instagramAccountId: string;
  instagramUsername: string | null;
  instagramName: string | null;
  profilePictureUrl: string | null;
  pageId: string | null;
  pageName: string | null;
  userAccessTokenLast4: string | null;
  pageAccessTokenLast4: string | null;
  webhookFields: string[];
  webhookSubscribed: boolean;
  webhookLastError: string | null;
  connectedAt: string;
  lastSyncedAt: string | null;
  metadata: Record<string, unknown>;
}

export interface InstagramConnectableAccount {
  pageId: string;
  pageName: string | null;
  instagramAccountId: string;
  instagramUsername: string | null;
  instagramName: string | null;
  profilePictureUrl: string | null;
}

export interface MessengerChannelConnection {
  id: string;
  userId: string;
  connectionMethod: MessengerConnectionMethod;
  status: 'connected' | 'pending' | 'error' | 'disconnected';
  pageId: string;
  pageName: string | null;
  pagePictureUrl: string | null;
  pageTasks: string[];
  pageAccessTokenLast4: string | null;
  webhookFields: string[];
  webhookSubscribed: boolean;
  webhookLastError: string | null;
  connectedAt: string;
  lastSyncedAt: string | null;
  metadata: Record<string, unknown>;
}

export interface MessengerConnectablePage {
  pageId: string;
  pageName: string | null;
  pagePictureUrl: string | null;
  pageTasks: string[];
  canSendMessages: boolean;
  canManageWebhooks: boolean;
}

export type MetaAdsIntegrationStatus = 'draft' | 'ready' | 'error';

export interface MetaAdsPageOption {
  pageId: string;
  pageName: string | null;
  pagePictureUrl: string | null;
  pageTasks: string[];
  hasPageAccessToken: boolean;
}

export interface MetaAdsAdAccountOption {
  adAccountId: string;
  accountId: string | null;
  name: string | null;
  accountStatus: number | null;
  currency: string | null;
  timezoneName: string | null;
  businessId: string | null;
  businessName: string | null;
}

export interface MetaAdsIntegrationConfig {
  userId: string;
  status: MetaAdsIntegrationStatus;
  pageId: string | null;
  pageName: string | null;
  pagePictureUrl: string | null;
  pageAccessTokenLast4: string | null;
  adAccountId: string | null;
  adAccountName: string | null;
  adAccountStatus: number | null;
  currency: string | null;
  timezoneName: string | null;
  accessTokenLast4: string | null;
  permissions: string[];
  connectedAt: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  metadata: Record<string, unknown>;
}

export interface MetaAdsIntegrationSetupResponse {
  config: MetaAdsIntegrationConfig | null;
  pages: MetaAdsPageOption[];
  adAccounts: MetaAdsAdAccountOption[];
}

export interface MetaAdsLeadFormOption {
  formId: string;
  pageId: string;
  name: string | null;
  status: string | null;
  locale: string | null;
  createdTime: string | null;
  followUpActionUrl: string | null;
  questions: string[];
}

export interface MetaAdsPixelOption {
  pixelId: string;
  adAccountId: string;
  name: string | null;
  createdTime: string | null;
  lastFiredTime: string | null;
}

export interface MetaAdsWhatsAppAccountOption {
  channelId: string;
  wabaId: string;
  phoneNumberId: string;
  businessAccountName: string | null;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
  status: MetaChannelConnection['status'] | null;
  lastSyncedAt: string | null;
}

export interface MetaAdsCreationSetupResponse {
  config: MetaAdsIntegrationConfig | null;
  pages: MetaAdsPageOption[];
  adAccounts: MetaAdsAdAccountOption[];
  leadForms: MetaAdsLeadFormOption[];
  pixels: MetaAdsPixelOption[];
  whatsAppAccounts: MetaAdsWhatsAppAccountOption[];
}

export interface MetaAdsIntegrationOptionsInput {
  accessToken: string;
  flowState?: string;
  oauthState?: string;
}

export interface MetaAdsIntegrationSaveInput {
  accessToken?: string;
  pageId: string;
  adAccountId: string;
  flowState?: string;
  oauthState?: string;
}

export type MetaAdsCampaignPeriod = 'last_7d' | 'last_30d' | 'this_month' | 'last_month' | 'maximum' | 'custom';
export type MetaAdsCampaignDeliveryFilter = 'all' | 'active' | 'inactive';

export interface MetaAdsCampaignFilters {
  period?: MetaAdsCampaignPeriod;
  since?: string;
  until?: string;
}

export interface MetaAdsCampaignActionResult {
  actionType: string;
  label: string;
  value: number;
}

export interface MetaAdsManagedAd {
  id: string;
  name: string | null;
  status: string | null;
  effectiveStatus: string | null;
  adsetId: string | null;
  adsetName: string | null;
  creativeId: string | null;
  creativeName: string | null;
  thumbnailUrl: string | null;
  previewText: string | null;
  raw: Record<string, unknown>;
}

export interface MetaAdsManagedCampaign {
  id: string;
  name: string | null;
  objective: string | null;
  status: string | null;
  effectiveStatus: string | null;
  deliveryStatus: string | null;
  results: MetaAdsCampaignActionResult | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  budgetAllocated: number | null;
  budgetAllocatedType: 'daily' | 'lifetime' | 'spend_cap' | 'adset' | null;
  budgetSpent: number | null;
  currency: string | null;
  startTime: string | null;
  stopTime: string | null;
  createdTime: string | null;
  updatedTime: string | null;
  ads: MetaAdsManagedAd[];
  raw: Record<string, unknown>;
  insightsRaw: Record<string, unknown> | null;
}

export interface MetaAdsCampaignsResponse {
  config: MetaAdsIntegrationConfig | null;
  campaigns: MetaAdsManagedCampaign[];
  period: MetaAdsCampaignPeriod;
  since: string | null;
  until: string | null;
}

export interface MetaAdsCampaignStatusUpdateInput {
  status: 'ACTIVE' | 'PAUSED';
}

export interface MetaAdsCampaignStatusUpdateResponse {
  campaignId: string;
  status: string;
  effectiveStatus: string | null;
}

export interface MetaAdsMediaAsset {
  id: string;
  name: string | null;
  hash: string | null;
  url: string | null;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  createdTime: string | null;
  source: 'meta';
  raw: Record<string, unknown>;
}

export interface MetaAdsMediaLibraryResponse {
  config: MetaAdsIntegrationConfig | null;
  assets: MetaAdsMediaAsset[];
}

export interface MetaTemplate {
  id: string;
  metaTemplateId: string | null;
  name: string;
  category: string | null;
  language: string;
  status: string | null;
  createdAt: string;
  updatedAt: string;
  raw: Record<string, unknown>;
}

export interface ConversationThread {
  id: string;
  contactWaId: string;
  contactName: string | null;
  username: string | null;
  displayPhone: string | null;
  email: string | null;
  source: string | null;
  remark: string | null;
  attributes: Record<string, unknown>;
  avatarUrl: string | null;
  status: ConversationThreadStatus;
  priority: 'Low' | 'Medium' | 'High';
  labels: string[];
  marketingOptedOut: boolean;
  ownerName: string | null;
  lastMessageText: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationMessage {
  id: string;
  threadId: string;
  waMessageId: string | null;
  direction: 'inbound' | 'outbound';
  messageType: string;
  body: string | null;
  senderName: string | null;
  senderWaId: string | null;
  recipientWaId: string | null;
  templateName: string | null;
  status: string | null;
  createdAt: string;
  raw: Record<string, unknown>;
}

export type WalletType = 'platform' | 'campaign_estimate' | 'partner_managed_waba';
export type WalletTransactionType = 'credit' | 'debit' | 'refund' | 'adjustment';
export type WalletTransactionSource = 'razorpay' | 'stripe' | 'manual' | 'system';
export type WalletTransactionPurpose = 'subscription' | 'addon' | 'campaign_estimate' | 'waba_billing';
export type WalletTransactionStatus = 'pending' | 'successful' | 'failed' | 'refunded';

export interface WalletFeatureFlags {
  enablePlatformWallet: boolean;
  enableCampaignEstimator: boolean;
  enableWabaCreditBilling: boolean;
  enablePartnerBillingMode: boolean;
}

export interface WalletTransaction {
  id: string;
  walletId: string;
  createdAt: string;
  updatedAt: string;
  description: string;
  type: WalletTransactionType;
  source: WalletTransactionSource;
  purpose: WalletTransactionPurpose;
  status: WalletTransactionStatus;
  amount: number;
  currency: string;
  externalReference: string | null;
  metadata: Record<string, unknown>;
}

export interface WalletSummary {
  id: string | null;
  userId: string | null;
  orgId: string | null;
  currency: string;
  preferredCurrency: string | null;
  availableBalance: number;
  lockedBalance: number;
  walletType: WalletType;
  rechargeEnabled: boolean;
  pricingOverviewUrl: string;
  featureFlags: WalletFeatureFlags;
  transactions: WalletTransaction[];
}

export interface CallLog {
  id: string;
  callId: string | null;
  name: string | null;
  phone: string;
  type: 'incoming' | 'outgoing' | 'missed';
  createdAt: string;
  durationSeconds: number;
}

export type WhatsAppCallDirection = 'incoming' | 'outgoing';
export type WhatsAppCallState =
  | 'incoming'
  | 'dialing'
  | 'ringing'
  | 'connecting'
  | 'ongoing'
  | 'ending'
  | 'ended'
  | 'rejected'
  | 'missed'
  | 'failed';
export type WhatsAppCallPermissionStatus = 'granted' | 'pending' | 'denied' | 'expired' | string;
export type WhatsAppCallPermissionActionName =
  | 'start_call'
  | 'send_call_permission_request'
  | string;
export type WhatsAppCallManageAction =
  | 'connect'
  | 'pre_accept'
  | 'accept'
  | 'reject'
  | 'terminate';

export interface WhatsAppCallActionLimit {
  timePeriod: string;
  currentUsage: number;
  maxAllowed: number;
  limitExpirationTime: number | null;
}

export interface WhatsAppCallPermissionAction {
  actionName: WhatsAppCallPermissionActionName;
  canPerformAction: boolean;
  limits: WhatsAppCallActionLimit[];
}

export interface WhatsAppCallPermission {
  status: WhatsAppCallPermissionStatus;
  expirationTime: number | null;
}

export interface WhatsAppCallPermissionResponse {
  messagingProduct: string;
  permission: WhatsAppCallPermission;
  actions: WhatsAppCallPermissionAction[];
}

export interface SendCallPermissionRequestInput {
  userWaId: string;
  threadId?: string;
  body?: string;
  clientTempId?: string;
}

export interface SendCallPermissionRequestResponse {
  ok: true;
  thread: ConversationThread;
  message: ConversationMessage;
}

export type WorkspaceOptionType = 'label' | 'attribute';

export interface WorkspaceOptionDefinition {
  id: string;
  userId: string;
  type: WorkspaceOptionType;
  name: string;
  valueType: 'text' | 'number' | 'date' | 'boolean' | 'select' | string;
  options: string[];
  color: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceOptionInput {
  type: WorkspaceOptionType;
  name: string;
  valueType?: WorkspaceOptionDefinition['valueType'];
  options?: string[];
  color?: string | null;
  description?: string | null;
}

export type WhatsAppCallSettingStatus = 'enabled' | 'disabled' | string;
export type WhatsAppCallIconVisibility = 'visible' | 'hidden' | string;

export interface WhatsAppCallHoursWindow {
  dayOfWeek: string;
  openTime: string;
  closeTime: string;
}

export interface WhatsAppCallHolidaySchedule {
  date: string;
  startTime: string;
  endTime: string;
}

export interface WhatsAppCallHoursSettings {
  status: WhatsAppCallSettingStatus;
  timezoneId: string | null;
  weeklyOperatingHours: WhatsAppCallHoursWindow[];
  holidaySchedule: WhatsAppCallHolidaySchedule[];
  raw: Record<string, unknown>;
}

export interface WhatsAppCallSettings {
  phoneNumberId: string;
  status: WhatsAppCallSettingStatus;
  callIconVisibility: WhatsAppCallIconVisibility;
  callbackPermissionStatus: WhatsAppCallSettingStatus;
  callHours: WhatsAppCallHoursSettings | null;
  raw: Record<string, unknown>;
}

export interface WhatsAppCallSettingsUpdateInput {
  status?: WhatsAppCallSettingStatus;
  callIconVisibility?: WhatsAppCallIconVisibility;
  callbackPermissionStatus?: WhatsAppCallSettingStatus;
  callHours?: {
    status: WhatsAppCallSettingStatus;
    timezoneId?: string | null;
    weeklyOperatingHours?: WhatsAppCallHoursWindow[];
    holidaySchedule?: WhatsAppCallHolidaySchedule[];
  } | null;
}

export interface WhatsAppCallSession {
  sdpType: 'offer' | 'answer';
  sdp: string;
}

export interface WhatsAppCallSessionRecord {
  id: string;
  callId: string;
  contactWaId: string | null;
  contactName: string | null;
  displayPhone: string | null;
  direction: WhatsAppCallDirection;
  state: WhatsAppCallState;
  startedAt: string;
  connectedAt: string | null;
  updatedAt: string;
  endedAt: string | null;
  offerSdp: string | null;
  answerSdp: string | null;
  bizOpaqueCallbackData: string | null;
  lastEvent: string | null;
  raw: Record<string, unknown>;
}

export interface WhatsAppCallManageInput {
  to?: string;
  callId?: string;
  action: WhatsAppCallManageAction;
  session?: WhatsAppCallSession;
  bizOpaqueCallbackData?: string;
}

export interface WhatsAppCallManageResponse {
  messagingProduct: string | null;
  callId: string | null;
  callIds: string[];
  success: boolean;
  callLog?: CallLog;
  callSession?: WhatsAppCallSessionRecord;
}

export interface WhatsAppBlockedUser {
  messagingProduct: string | null;
  waId: string;
}

export interface WhatsAppBlockedUsersPaging {
  after: string | null;
  before: string | null;
}

export interface WhatsAppBlockedUsersResponse {
  data: WhatsAppBlockedUser[];
  paging: WhatsAppBlockedUsersPaging | null;
}

export interface WhatsAppBlockedUserOperation {
  input: string | null;
  waId: string | null;
}

export interface WhatsAppBlockedUsersMutationResponse {
  messagingProduct: string | null;
  users: WhatsAppBlockedUserOperation[];
}

export type WhatsAppBusinessAppealStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'UNDER_REVIEW'
  | 'EXPIRED'
  | 'CANCELLED'
  | (string & {});

export interface WhatsAppOfficialBusinessAccountStatus {
  id: string;
  obaStatus: WhatsAppBusinessAppealStatus | null;
  statusMessage: string | null;
  lastCheckedAt: string | null;
  lastError?: string | null;
}

export interface WhatsAppOfficialBusinessAccountUpdateInput {
  businessWebsiteUrl?: string;
  business_website_url?: string;
  primaryCountryOfOperation?: string;
  primary_country_of_operation?: string;
  primaryLanguage?: string;
  primary_language?: string;
  parentBusinessOrBrand?: string;
  parent_business_or_brand?: string;
  supportingLinks?: string[];
  supporting_links?: string[];
  additionalSupportingInformation?: string;
  additional_supporting_information?: string;
}

export interface WhatsAppOfficialBusinessAccountUpdateResponse {
  success: boolean;
  message: string | null;
  updatedStatus: WhatsAppOfficialBusinessAccountStatus | null;
  trackingId: string | null;
}

export interface WhatsAppDisplayNameRequest {
  requestedName: string;
  requestedAt: string;
  status: string | null;
  lastError: string | null;
}

export interface WhatsAppTwoStepVerificationStatus {
  codeVerificationStatus: string | null;
  isPinEnabled: boolean | null;
  liveStatusCheckedAt: string | null;
  enabledAt: string | null;
  disabledAt: string | null;
  lastPinUpdatedAt: string | null;
}

export interface DashboardBootstrap {
  profile: AppProfile | null;
  channel: MetaChannelConnection | null;
  instagramChannel: InstagramChannelConnection | null;
  messengerChannel: MessengerChannelConnection | null;
  adsIntegration: MetaAdsIntegrationConfig | null;
  templates: MetaTemplate[];
  conversations: ConversationThread[];
  notifications: UserNotification[];
  notificationPreferences: NotificationPreferences;
  wallet: WalletSummary;
  callHistory: CallLog[];
  callSessions: WhatsAppCallSessionRecord[];
}

export type DeveloperApiScope =
  | 'messages:read'
  | 'messages:write'
  | 'contacts:read'
  | 'contacts:write'
  | 'webhooks:manage';

export interface DeveloperApiCredential {
  id: string;
  userId: string;
  name: string;
  apiKey: string;
  secretLast4: string;
  scopes: DeveloperApiScope[];
  status: 'active' | 'revoked';
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeveloperApiCredentialCreateInput {
  name?: string;
  scopes?: DeveloperApiScope[];
}

export type DeveloperWebhookEvent =
  | 'message.received'
  | 'message.read'
  | 'message.delivered'
  | 'message.failed'
  | 'conversation.created'
  | 'contact.created'
  | 'template.status_updated'
  | 'campaign.sent';

export interface DeveloperWebhookEndpoint {
  id: string;
  userId: string;
  name: string;
  url: string;
  events: DeveloperWebhookEvent[];
  status: 'active' | 'paused';
  signingSecretLast4: string;
  lastDeliveryAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeveloperWebhookCreateInput {
  name?: string;
  url: string;
  events: DeveloperWebhookEvent[];
}

export interface DeveloperWebhookUpdateInput {
  name?: string;
  url?: string;
  events?: DeveloperWebhookEvent[];
  status?: DeveloperWebhookEndpoint['status'];
}

export type WooCommerceAutomationId =
  | 'abandoned-recovery'
  | 'order-confirmation'
  | 'order-fulfilled'
  | 'purchase-follow-up'
  | 'return-exchange';

export interface WooCommerceAutomationSetting {
  id: WooCommerceAutomationId;
  enabled: boolean;
  templateKey: string;
  sendAfterMinutes: number;
}

export interface WooCommerceConnection {
  userId: string;
  storeName: string | null;
  storeUrl: string;
  consumerKeyLast4: string;
  consumerSecretLast4: string;
  webhookSecretLast4: string;
  status: 'connected' | 'error' | 'disconnected';
  automations: WooCommerceAutomationSetting[];
  lastVerifiedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WooCommerceConnectionInput {
  storeUrl: string;
  consumerKey: string;
  consumerSecret: string;
  automations?: WooCommerceAutomationSetting[];
}

export interface WooCommerceConnectionVerifyInput {
  storeUrl: string;
  consumerKey: string;
  consumerSecret: string;
}

export interface WooCommerceConnectionVerifyResponse {
  ok: boolean;
  storeName: string | null;
  storeUrl: string;
}

export interface WooCommerceSetupResponse {
  connection: WooCommerceConnection | null;
  callbackUrl: string;
}

export type EmailConnectionStatus = 'connected' | 'pending' | 'error';

export interface EmailConnectionSummary {
  userId: string;
  displayName: string;
  emailAddress: string;
  authUser: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  status: EmailConnectionStatus;
  lastVerifiedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmailConnectionUpsertInput {
  displayName: string;
  emailAddress: string;
  authUser: string;
  password: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
}

export interface EmailConnectionVerifySmtpInput {
  displayName: string;
  emailAddress: string;
  authUser: string;
  password: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
}

export interface EmailConnectionVerifyImapInput {
  displayName: string;
  emailAddress: string;
  authUser: string;
  password: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
}

export interface EmailConnectionCheckResult {
  ok: boolean;
  message: string;
  latencyMs: number | null;
}

export interface EmailConnectionVerifyResponse {
  smtp: EmailConnectionCheckResult;
  imap: EmailConnectionCheckResult;
  canConnect: boolean;
}

export interface EmailMessage {
  id: string;
  folder: string;
  subject: string;
  fromName: string | null;
  fromEmail: string | null;
  to: string[];
  receivedAt: string | null;
  htmlBody: string | null;
  textBody: string | null;
  previewText: string;
  isUnread: boolean;
}

export type EmailTemplateEditorMode = 'rich' | 'html';

export interface EmailTemplate {
  id: string;
  userId: string;
  name: string;
  subject: string;
  editorMode: EmailTemplateEditorMode;
  htmlContent: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmailTemplateSaveInput {
  name: string;
  subject: string;
  editorMode: EmailTemplateEditorMode;
  htmlContent: string;
}

export interface EmailRecipient {
  email: string;
  name?: string | null;
}

export type EmailCampaignAudienceSource = 'contacts' | 'custom';
export type EmailCampaignStatus = 'sent' | 'partial' | 'failed';

export interface EmailCampaign {
  id: string;
  userId: string;
  templateId: string | null;
  templateName: string | null;
  campaignName: string;
  subject: string;
  htmlContent: string;
  audienceSource: EmailCampaignAudienceSource;
  recipientCount: number;
  status: EmailCampaignStatus;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmailCampaignSendInput {
  templateId: string;
  campaignName: string;
  audienceSource: EmailCampaignAudienceSource;
  recipients: EmailRecipient[];
}

export interface ContactUpsertInput {
  contactWaId: string;
  contactName?: string;
  displayPhone?: string;
  email?: string;
  source?: string;
  remark?: string;
  avatarUrl?: string;
  status?: ConversationThread['status'];
  priority?: ConversationThread['priority'];
  labels?: string[];
  marketingOptedOut?: boolean;
  ownerName?: string;
}

export interface ContactUpdateInput {
  contactName?: string;
  displayPhone?: string;
  email?: string;
  source?: string;
  remark?: string;
  avatarUrl?: string;
  status?: ConversationThread['status'];
  priority?: ConversationThread['priority'];
  labels?: string[];
  marketingOptedOut?: boolean;
  ownerName?: string;
}

export interface WhatsAppBusinessProfile {
  about: string | null;
  address: string | null;
  description: string | null;
  displayNameStatus: string | null;
  displayNameRequest: WhatsAppDisplayNameRequest | null;
  twoStepVerification: WhatsAppTwoStepVerificationStatus | null;
  officialBusinessAccountStatus: WhatsAppOfficialBusinessAccountStatus | null;
  email: string | null;
  profilePictureUrl: string | null;
  websites: string[];
  vertical: string | null;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
  messagingLimitTier: string | null;
  businessAccountName: string | null;
  phoneNumberId: string;
  wabaId: string;
}

export interface WhatsAppDisplayNameUpdateInput {
  displayName: string;
}

export interface WhatsAppBusinessProfileUpdateInput {
  about?: string;
  address?: string;
  description?: string;
  email?: string;
  profilePictureHandle?: string;
  websites?: string[];
  vertical?: string;
}

export interface WhatsAppCommerceSettings {
  id: string | null;
  phoneNumberId: string;
  isCartEnabled: boolean;
  isCatalogVisible: boolean;
}

export interface WhatsAppCommerceSettingsUpdateInput {
  isCartEnabled?: boolean;
  isCatalogVisible?: boolean;
}

export interface MetaCatalogWebhookSetupResponse {
  hasChannel: boolean;
  callbackUrl: string;
  verifyToken: string;
  connectedWabaId: string | null;
  connectedPhoneNumberId: string | null;
  businessAccountName: string | null;
  discoveredCatalogIds: string[];
  lastWebhookAt: string | null;
  lastMatchedAt: string | null;
  lastWebhookObject: string | null;
  lastCatalogIds: string[];
  lastError: string | null;
}

export interface MetaCatalogSummary {
  id: string;
  name: string | null;
  vertical: string | null;
  productCount: number | null;
  feedCount: number | null;
  businessId: string | null;
  businessName: string | null;
  defaultImageUrl: string | null;
  isCatalogSegment: boolean;
  isLocalCatalog: boolean;
}

export interface MetaCatalogListResponse {
  hasChannel: boolean;
  businessIds: string[];
  selectedCatalogId: string | null;
  catalogs: MetaCatalogSummary[];
}

export interface MetaCatalogConnectionInput {
  code: string;
  redirectUri: string;
  flowState?: string;
  oauthState?: string;
}

export interface MetaCatalogCreateInput {
  name: string;
}

export interface MetaCatalogSelectionInput {
  catalogId: string | null;
}

export interface MetaCatalogProduct {
  id: string;
  retailerId: string | null;
  name: string | null;
  description: string | null;
  availability: string | null;
  price: string | null;
  currency: string | null;
  brand: string | null;
  imageUrl: string | null;
  url: string | null;
  raw: Record<string, unknown>;
}

export interface MetaCatalogProductsResponse {
  selectedCatalogId: string | null;
  catalog: MetaCatalogSummary | null;
  products: MetaCatalogProduct[];
}

export interface MetaCatalogItemMutation {
  method: 'create' | 'update' | 'delete';
  data: {
    id: string;
    title?: string;
    description?: string;
    brand?: string;
    price?: string;
    image_link?: string;
    availability?: string;
    link?: string;
  };
}

export interface MetaCatalogItemsBatchInput {
  itemType?: 'PRODUCT_ITEM';
  requests: MetaCatalogItemMutation[];
}

export interface WhatsAppAutomationCommand {
  commandName: string;
  commandDescription: string;
}

export interface WhatsAppConversationalAutomationConfig {
  userId: string;
  metaChannelId: string | null;
  phoneNumberId: string | null;
  enableWelcomeMessage: boolean;
  prompts: string[];
  commands: WhatsAppAutomationCommand[];
  lastSyncedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsAppConversationalAutomationUpdateInput {
  enableWelcomeMessage?: boolean;
  prompts?: string[];
  commands?: WhatsAppAutomationCommand[];
}

export type AutomationRuleTriggerType =
  | 'incoming_message_keyword'
  | 'whatsapp_message_received'
  | 'instagram_message_received'
  | 'contact_attribute_added'
  | 'contact_attribute_changed'
  | 'lead_created';
export type AutomationRuleKeywordMatchMode = 'any' | 'contains' | 'equals' | 'starts_with' | 'ends_with' | 'fuzzy';
export type AutomationRuleActionType = 'send_text' | 'send_template' | 'send_flow' | 'opt_out_marketing';
export type AutomationRuleFilterType =
  | 'message_contains_keywords'
  | 'contact_initiates_chat'
  | 'timestamp'
  | 'no_keyword_matches'
  | 'contact_exists'
  | 'contact_attribute';
export type AutomationRuleFilterOperator =
  | 'contains_any'
  | 'equals'
  | 'contains'
  | 'starts_with'
  | 'ends_with'
  | 'fuzzy'
  | 'does_not_equal'
  | 'between'
  | 'outside'
  | 'is_true'
  | 'is_false';

export interface AutomationRuleFilterCondition {
  id?: string;
  type: AutomationRuleFilterType;
  operator: AutomationRuleFilterOperator;
  field?: string;
  value?: string;
  values?: string[];
  startTime?: string;
  endTime?: string;
}

export interface AutomationRuleFilterGroup {
  operator: 'AND' | 'OR';
  conditions: AutomationRuleFilterCondition[];
}

export interface AutomationRuleAction {
  type: AutomationRuleActionType;
  messageBody?: string;
  templateName?: string;
  templateLanguage?: string;
  flowId?: string;
  flowCta?: string;
  flowHeader?: string;
  flowBody?: string;
  flowFooter?: string;
  flowMode?: 'draft' | 'published';
  flowToken?: string;
  flowAction?: 'navigate' | 'data_exchange';
  flowScreen?: string;
  flowActionData?: Record<string, unknown>;
  filters?: AutomationRuleFilterGroup;
}

export interface AutomationRule {
  id: string;
  userId: string;
  metaChannelId: string | null;
  name: string;
  isEnabled: boolean;
  triggerType: AutomationRuleTriggerType;
  keyword: string;
  keywordMatchMode: AutomationRuleKeywordMatchMode;
  filters?: AutomationRuleFilterGroup;
  action: AutomationRuleAction;
  lastTriggeredAt: string | null;
  triggerCount: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationRuleInput {
  id?: string;
  name?: string;
  isEnabled?: boolean;
  triggerType?: AutomationRuleTriggerType;
  keyword?: string;
  keywordMatchMode?: AutomationRuleKeywordMatchMode;
  filters?: AutomationRuleFilterGroup;
  action?: AutomationRuleAction;
}

export type WhatsAppFlowStatus =
  | 'DRAFT'
  | 'PUBLISHED'
  | 'DEPRECATED'
  | 'BLOCKED'
  | 'THROTTLED'
  | (string & {});

export type WhatsAppFlowCategory =
  | 'SIGN_UP'
  | 'SIGN_IN'
  | 'APPOINTMENT_BOOKING'
  | 'LEAD_GENERATION'
  | 'CONTACT_US'
  | 'CUSTOMER_SUPPORT'
  | 'SURVEY'
  | 'OTHER'
  | (string & {});

export type WhatsAppFlowFieldType = 'text' | 'number' | 'email' | 'phone' | 'date' | 'select';

export interface WhatsAppFlowField {
  id: string;
  type: WhatsAppFlowFieldType;
  label: string;
  required: boolean;
  options?: string[];
  validation?: Record<string, unknown>;
}

export interface WhatsAppFlow {
  id: string;
  userId: string;
  metaChannelId: string | null;
  metaFlowId: string | null;
  name: string;
  status: WhatsAppFlowStatus;
  categories: WhatsAppFlowCategory[];
  schema: WhatsAppFlowField[];
  raw: Record<string, unknown>;
  previewUrl: string | null;
  previewExpiresAt: string | null;
  submissionCount: number;
  lastSubmittedAt: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsAppFlowInput {
  name: string;
  category?: WhatsAppFlowCategory;
  categories?: WhatsAppFlowCategory[];
  schema: WhatsAppFlowField[];
  publish?: boolean;
}

export interface WhatsAppFlowUpdateInput {
  name?: string;
  category?: WhatsAppFlowCategory;
  categories?: WhatsAppFlowCategory[];
  schema?: WhatsAppFlowField[];
}

export type InboxInsightsChannel = 'all' | 'whatsapp' | 'instagram' | 'messenger';
export type InboxInsightsPeriod = 'today' | '7d' | '30d' | 'custom';

export interface InboxInsightsFilters {
  startDate: string;
  endDate: string;
  channel: InboxInsightsChannel;
}

export interface InboxInsightsResponse {
  filters: InboxInsightsFilters;
  isChannelSupported: boolean;
  lastUpdatedAt: string;
  messagingLimit: {
    consumed: number;
    total: number | null;
    tier: string | null;
  };
  messagingQuality: string | null;
  totals: {
    sent: number;
    delivered: number;
    received: number;
  };
  outcomes: {
    read: number;
    replied: number;
    failed: number;
  };
}

export interface MetaLeadCaptureConfig {
  userId: string;
  metaChannelId: string | null;
  status: 'draft' | 'ready' | 'error';
  appId: string | null;
  pageIds: string[];
  formIds: string[];
  accessTokenLast4: string | null;
  verifyToken: string;
  verifiedAt: string | null;
  callbackUrl: string;
  defaultOwnerName: string | null;
  defaultLabels: string[];
  autoCreateLeads: boolean;
  lastWebhookAt: string | null;
  lastLeadSyncedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MetaLeadCaptureEvent {
  id: string;
  userId: string;
  pageId: string | null;
  formId: string | null;
  leadId: string | null;
  eventTime: string | null;
  processingStatus: 'received' | 'processed' | 'skipped' | 'error';
  errorMessage: string | null;
  raw: Record<string, unknown>;
  createdAt: string;
}

export interface MetaLeadCapturePageSubscription {
  pageId: string;
  appId: string | null;
  appName: string | null;
  subscribed: boolean;
  subscribedFields: string[];
  errorMessage: string | null;
}

export interface MetaLeadCaptureSetupInput {
  status?: MetaLeadCaptureConfig['status'];
  appId?: string | null;
  pageIds?: string[];
  formIds?: string[];
  accessToken?: string;
  defaultOwnerName?: string | null;
  defaultLabels?: string[];
  autoCreateLeads?: boolean;
  regenerateVerifyToken?: boolean;
}

export interface MetaLeadCaptureConnectionInput {
  accessToken: string;
  pageIds?: string[];
  flowState?: string;
  oauthState?: string;
}

export interface MetaLeadCaptureSetupResponse {
  config: MetaLeadCaptureConfig;
  recentEvents: MetaLeadCaptureEvent[];
  pageSubscriptions: MetaLeadCapturePageSubscription[];
}

export type WhatsAppBusinessActivityType =
  | 'ACCOUNT_CREATED'
  | 'ACCOUNT_UPDATED'
  | 'ACCOUNT_DELETED'
  | 'PHONE_NUMBER_ADDED'
  | 'PHONE_NUMBER_REMOVED'
  | 'PHONE_NUMBER_VERIFIED'
  | 'USER_ADDED'
  | 'USER_REMOVED'
  | 'USER_ROLE_CHANGED'
  | 'PERMISSION_GRANTED'
  | 'PERMISSION_REVOKED'
  | 'TEMPLATE_CREATED'
  | 'TEMPLATE_UPDATED'
  | 'TEMPLATE_DELETED'
  | 'WEBHOOK_CONFIGURED'
  | 'API_ACCESS_GRANTED'
  | 'API_ACCESS_REVOKED'
  | 'BILLING_UPDATED'
  | 'COMPLIANCE_ACTION'
  | 'SECURITY_EVENT';

export type WhatsAppBusinessActorType = 'USER' | 'SYSTEM' | 'API' | 'ADMIN' | 'AUTOMATED_PROCESS';

export interface WhatsAppBusinessAccountActivity {
  id: string;
  activityType: WhatsAppBusinessActivityType | string;
  timestamp: string;
  actorType: WhatsAppBusinessActorType | string;
  actorId: string | null;
  actorName: string | null;
  description: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface WhatsAppBusinessActivitiesFilters {
  limit?: number;
  after?: string;
  before?: string;
  since?: string;
  until?: string;
  activityType?: string[];
}

export interface WhatsAppBusinessActivitiesResponse {
  wabaId: string;
  activities: WhatsAppBusinessAccountActivity[];
  paging: {
    before: string | null;
    after: string | null;
    previous: string | null;
    next: string | null;
  };
  fetchedAt: string;
}

export interface ProfileUpsertInput {
  fullName?: string | null;
  profilePictureUrl?: string | null;
  companyLogoUrl?: string | null;
  countryCode?: string | null;
  phone?: string | null;
  preferredCurrency?: string | null;
  companyName?: string | null;
  companyWebsite?: string | null;
  industry?: string | null;
  selectedPlan?: string;
  billingCycle?: BillingCycle | null;
  billingStatus?: BillingStatus | null;
  trialEndsAt?: string | null;
  freeTrialStartedAt?: string | null;
  couponCode?: string | null;
  razorpaySubscriptionId?: string | null;
  onboardingCompleted?: boolean;
}

export interface InviteWorkspaceUserInput {
  fullName: string;
  email: string;
  role: Exclude<WorkspaceUserRole, 'Owner'>;
}

export interface UpdateWorkspaceTeamMemberInput {
  fullName: string;
  role: Exclude<WorkspaceUserRole, 'Owner'>;
}

export interface BillingQuoteInput {
  planCode: BillingPlanCode;
  billingCycle: BillingCycle;
  couponCode?: string;
}

export interface BillingQuoteResponse {
  quote: BillingSummary;
}

export interface BillingPlansResponse {
  plans: BillingPlanDefinition[];
  generatedAt: string;
}

export interface CreateBillingSubscriptionInput {
  planCode: BillingPlanCode;
  billingCycle: BillingCycle;
  couponCode?: string;
}

export interface CreateBillingSubscriptionResponse {
  keyId: string;
  subscriptionId: string;
  businessName: string;
  businessLogoUrl: string | null;
  quote: BillingSummary;
}

export interface VerifyBillingSubscriptionInput {
  razorpayPaymentId: string;
  razorpaySubscriptionId: string;
  razorpaySignature: string;
}

export interface CreateWalletTopupInput {
  amount: number;
  currency?: string;
}

export interface CreateWalletTopupResponse {
  keyId: string;
  orderId: string;
  transactionId: string;
  amount: number;
  currency: string;
  businessName: string;
  businessLogoUrl: string | null;
  wallet: WalletSummary;
}

export interface VerifyWalletTopupInput {
  transactionId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

export interface ManualMetaConnectionInput {
  setupType: SetupType;
  accessToken: string;
  wabaId: string;
  phoneNumberId: string;
}

export interface EmbeddedMetaConnectionInput {
  setupType: SetupType;
  code: string;
  wabaId: string;
  phoneNumberId: string;
  redirectUri?: string;
  flowState?: string | null;
  oauthState?: string | null;
  setupContext?: {
    type?: string | null;
    event?: string | null;
    data?: Record<string, unknown>;
    receivedAt?: string | null;
    appId?: string | null;
    configId?: string | null;
    graphVersion?: string | null;
    redirectUri?: string | null;
    flowState?: string | null;
    oauthState?: string | null;
  };
}

export interface RegisterMetaSenderInput {
  pin?: string;
}

export interface UpdateMetaTwoStepVerificationInput {
  pin: string;
}

export interface RequestMetaVerificationCodeInput {
  codeMethod: 'SMS' | 'VOICE';
  language: string;
}

export interface VerifyMetaVerificationCodeInput {
  code: string;
}

export interface InstagramConnectionOptionsInput {
  longLivedToken?: string | null;
  accessToken?: string;
  flowState?: string;
  oauthState?: string;
}

export interface ConnectInstagramBusinessLoginInput {
  longLivedToken?: string | null;
  accessToken?: string;
  pageId?: string;
  flowState?: string;
  oauthState?: string;
}

export interface MessengerConnectionOptionsInput {
  accessToken?: string;
  flowState?: string;
  oauthState?: string;
}

export interface MetaOAuthCodeExchangeInput {
  code: string;
  redirectUri: string;
  flowState?: string;
  oauthState?: string;
}

export interface MetaOAuthCodeExchangeResponse {
  accessToken: string;
  flowState: string | null;
  oauthState: string | null;
}

export interface ConnectMessengerPageLoginInput {
  accessToken?: string;
  pageId?: string;
  flowState?: string;
  oauthState?: string;
}

export interface ConnectMessengerManualInput {
  pageId: string;
  pageAccessToken: string;
}

export interface WhatsAppMessageContextInput {
  message_id?: string;
}

export interface WhatsAppMediaObjectInput {
  id?: string;
  link?: string;
  caption?: string;
  filename?: string;
}

export interface WhatsAppMessageHeaderObject {
  type: 'text' | 'video' | 'image' | 'document';
  text?: string;
  sub_text?: string;
  document?: WhatsAppMediaObjectInput;
  image?: WhatsAppMediaObjectInput;
  video?: WhatsAppMediaObjectInput;
}

export interface WhatsAppMessageBodyObject {
  text: string;
}

export interface WhatsAppMessageFooterObject {
  text: string;
}

export interface WhatsAppInteractiveObject {
  type:
    | 'button'
    | 'call_permission_request'
    | 'catalog_message'
    | 'list'
    | 'product'
    | 'product_list'
    | 'flow';
  header?: WhatsAppMessageHeaderObject;
  body?: WhatsAppMessageBodyObject;
  footer?: WhatsAppMessageFooterObject;
  action: Record<string, unknown>;
}

export interface WhatsAppContactAddressObject {
  city?: string;
  country?: string;
  country_code?: string;
  state?: string;
  street?: string;
  type?: 'HOME' | 'WORK';
  zip?: string;
}

export interface WhatsAppContactEmailObject {
  email: string;
  type?: 'HOME' | 'WORK';
}

export interface WhatsAppContactNameObject {
  first_name?: string;
  formatted_name?: string;
  last_name?: string;
  middle_name?: string;
  prefix?: string;
  suffix?: string;
}

export interface WhatsAppContactOrganizationObject {
  company?: string;
  department?: string;
  title?: string;
}

export interface WhatsAppContactPhoneObject {
  phone: string;
  type?: 'HOME' | 'WORK';
  wa_id?: string;
}

export interface WhatsAppContactUrlObject {
  type?: 'HOME' | 'WORK';
  url: string;
}

export interface WhatsAppContactObject {
  addresses?: WhatsAppContactAddressObject[];
  birthday?: string;
  emails?: WhatsAppContactEmailObject[];
  name?: WhatsAppContactNameObject;
  org?: WhatsAppContactOrganizationObject;
  phones?: WhatsAppContactPhoneObject[];
  urls?: WhatsAppContactUrlObject[];
}

export interface WhatsAppLocationObject {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

export interface WhatsAppReactionObject {
  message_id: string;
  emoji: string;
}

export interface WhatsAppTemplateObject {
  name: string;
  language: {
    code: string;
  };
  components?: Array<Record<string, unknown>>;
}

export interface WhatsAppBaseMessagePayload {
  messaging_product?: 'whatsapp';
  recipient_type?: 'individual' | 'group';
  to: string;
  context?: WhatsAppMessageContextInput;
}

export interface WhatsAppTextMessagePayload extends WhatsAppBaseMessagePayload {
  type: 'text';
  text: {
    body: string;
    preview_url?: boolean;
  };
}

export interface WhatsAppAudioMessagePayload extends WhatsAppBaseMessagePayload {
  type: 'audio';
  audio: WhatsAppMediaObjectInput;
}

export interface WhatsAppVideoMessagePayload extends WhatsAppBaseMessagePayload {
  type: 'video';
  video: WhatsAppMediaObjectInput;
}

export interface WhatsAppDocumentMessagePayload extends WhatsAppBaseMessagePayload {
  type: 'document';
  document: WhatsAppMediaObjectInput;
}

export interface WhatsAppImageMessagePayload extends WhatsAppBaseMessagePayload {
  type: 'image';
  image: WhatsAppMediaObjectInput;
}

export interface WhatsAppStickerMessagePayload extends WhatsAppBaseMessagePayload {
  type: 'sticker';
  sticker: WhatsAppMediaObjectInput;
}

export interface WhatsAppLocationMessagePayload extends WhatsAppBaseMessagePayload {
  type: 'location';
  location: WhatsAppLocationObject;
}

export interface WhatsAppReactionMessagePayload extends WhatsAppBaseMessagePayload {
  type: 'reaction';
  reaction: WhatsAppReactionObject;
}

export interface WhatsAppInteractiveMessagePayload extends WhatsAppBaseMessagePayload {
  type: 'interactive';
  interactive: WhatsAppInteractiveObject;
}

export interface WhatsAppTemplateMessagePayload extends WhatsAppBaseMessagePayload {
  type: 'template';
  template: WhatsAppTemplateObject;
}

export interface WhatsAppContactsMessagePayload extends WhatsAppBaseMessagePayload {
  type: 'contacts';
  contacts: WhatsAppContactObject[];
}

export type WhatsAppMessagePayload =
  | WhatsAppAudioMessagePayload
  | WhatsAppContactsMessagePayload
  | WhatsAppDocumentMessagePayload
  | WhatsAppImageMessagePayload
  | WhatsAppInteractiveMessagePayload
  | WhatsAppLocationMessagePayload
  | WhatsAppReactionMessagePayload
  | WhatsAppStickerMessagePayload
  | WhatsAppTemplateMessagePayload
  | WhatsAppTextMessagePayload
  | WhatsAppVideoMessagePayload;

export interface SendWhatsAppMessageInput {
  clientTempId?: string;
  message: WhatsAppMessagePayload;
}

export interface SendTextMessageInput {
  to: string;
  body: string;
  previewUrl?: boolean;
  replyToMessageId?: string;
  clientTempId?: string;
}

export interface SendMediaMessageInput {
  to: string;
  mediaId?: string;
  mediaLink?: string;
  mediaType: 'image' | 'video' | 'audio' | 'document';
  caption?: string;
  fileName?: string;
  mimeType?: string;
  replyToMessageId?: string;
  clientTempId?: string;
}

export interface SendTemplateMessageInput {
  to: string;
  templateName: string;
  language: string;
  components?: Array<Record<string, unknown>>;
  flowToken?: string;
  flowActionData?: Record<string, unknown>;
  replyToMessageId?: string;
  clientTempId?: string;
}

export type MarketingMessageProductPolicy = 'CLOUD_API_FALLBACK' | 'STRICT';

export interface MarketingCampaignRecipientInput {
  to: string;
  contactName?: string | null;
  threadId?: string | null;
}

export interface LaunchMarketingCampaignInput {
  campaignName: string;
  templateName: string;
  language: string;
  recipients: MarketingCampaignRecipientInput[];
  components?: Array<Record<string, unknown>>;
  productPolicy?: MarketingMessageProductPolicy;
  messageActivitySharing?: boolean;
}

export interface MarketingCampaignRecipientResult {
  to: string;
  contactName: string | null;
  success: boolean;
  threadId: string | null;
  messageId: string | null;
  messageStatus: 'accepted' | 'held_for_quality_assessment' | 'paused' | string | null;
  error: string | null;
}

export interface LaunchMarketingCampaignResponse {
  campaignName: string;
  templateName: string;
  audienceCount: number;
  sentCount: number;
  failedCount: number;
  optedOutCount: number;
  heldForQualityAssessmentCount: number;
  pausedCount: number;
  results: MarketingCampaignRecipientResult[];
}

export interface CreateTemplateInput {
  name: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  language: string;
  headerType: 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  headerText?: string;
  headerMediaHandle?: string;
  headerMediaSampleUrl?: string;
  headerMediaPreviewUrl?: string;
  headerMediaFileName?: string;
  headerMediaMimeType?: string;
  body: string;
  footer?: string;
  buttons?: Array<
    | {
        type: 'QUICK_REPLY';
        text: string;
      }
    | {
        type: 'URL';
        text: string;
        url: string;
      }
    | {
        type: 'FLOW';
        text: string;
        flowId?: string;
        flowName?: string;
        flowJson?: Record<string, unknown> | string;
        flowAction?: 'navigate' | 'data_exchange';
        navigateScreen?: string;
      }
  >;
}
