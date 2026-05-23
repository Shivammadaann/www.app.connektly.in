create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.app_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  profile_picture_url text,
  company_logo_url text,
  country_code text,
  phone text,
  preferred_currency text,
  company_name text,
  company_website text,
  industry text,
  selected_plan text,
  billing_cycle text,
  billing_status text,
  trial_ends_at timestamptz,
  free_trial_started_at timestamptz,
  coupon_code text,
  razorpay_subscription_id text,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.app_profiles add column if not exists billing_cycle text;
alter table public.app_profiles add column if not exists billing_status text;
alter table public.app_profiles add column if not exists trial_ends_at timestamptz;
alter table public.app_profiles add column if not exists free_trial_started_at timestamptz;
alter table public.app_profiles add column if not exists coupon_code text;
alter table public.app_profiles add column if not exists razorpay_subscription_id text;
alter table public.app_profiles add column if not exists profile_picture_url text;
alter table public.app_profiles add column if not exists company_logo_url text;
alter table public.app_profiles add column if not exists preferred_currency text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'app-profile-pictures',
  'app-profile-pictures',
  true,
  5242880,
  array['image/png', 'image/jpeg']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.meta_channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  setup_type text,
  connection_method text not null,
  status text not null default 'connected',
  waba_id text not null,
  phone_number_id text not null,
  display_phone_number text,
  verified_name text,
  quality_rating text,
  messaging_limit_tier text,
  business_account_name text,
  access_token_ciphertext text not null,
  access_token_last4 text,
  metadata jsonb not null default '{}'::jsonb,
  connected_at timestamptz not null default timezone('utc', now()),
  last_synced_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists meta_channels_phone_number_id_key on public.meta_channels (phone_number_id);

create table if not exists public.instagram_channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  connection_method text not null,
  status text not null default 'connected',
  instagram_account_id text not null,
  instagram_username text,
  instagram_name text,
  profile_picture_url text,
  page_id text not null,
  page_name text,
  user_access_token_ciphertext text not null,
  user_access_token_last4 text,
  page_access_token_ciphertext text not null,
  page_access_token_last4 text,
  metadata jsonb not null default '{}'::jsonb,
  connected_at timestamptz not null default timezone('utc', now()),
  last_synced_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists instagram_channels_instagram_account_id_key
  on public.instagram_channels (instagram_account_id);

create table if not exists public.messenger_channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  connection_method text not null,
  status text not null default 'connected',
  page_id text not null,
  page_name text,
  page_picture_url text,
  page_tasks text[] not null default '{}',
  page_access_token_ciphertext text not null,
  page_access_token_last4 text,
  webhook_fields text[] not null default '{}',
  webhook_subscribed boolean not null default false,
  webhook_last_error text,
  metadata jsonb not null default '{}'::jsonb,
  connected_at timestamptz not null default timezone('utc', now()),
  last_synced_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.messenger_channels add column if not exists page_name text;
alter table public.messenger_channels add column if not exists page_picture_url text;
alter table public.messenger_channels add column if not exists page_tasks text[] not null default '{}';
alter table public.messenger_channels add column if not exists page_access_token_last4 text;
alter table public.messenger_channels add column if not exists webhook_fields text[] not null default '{}';
alter table public.messenger_channels add column if not exists webhook_subscribed boolean not null default false;
alter table public.messenger_channels add column if not exists webhook_last_error text;

create unique index if not exists messenger_channels_page_id_key
  on public.messenger_channels (page_id);

create table if not exists public.meta_ads_integrations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'draft',
  page_id text,
  page_name text,
  page_picture_url text,
  page_access_token_ciphertext text,
  page_access_token_last4 text,
  ad_account_id text,
  ad_account_name text,
  ad_account_status integer,
  currency text,
  timezone_name text,
  access_token_ciphertext text,
  access_token_last4 text,
  permissions text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  last_error text,
  connected_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.meta_ads_integrations add column if not exists status text not null default 'draft';
alter table public.meta_ads_integrations add column if not exists page_id text;
alter table public.meta_ads_integrations add column if not exists page_name text;
alter table public.meta_ads_integrations add column if not exists page_picture_url text;
alter table public.meta_ads_integrations add column if not exists page_access_token_ciphertext text;
alter table public.meta_ads_integrations add column if not exists page_access_token_last4 text;
alter table public.meta_ads_integrations add column if not exists ad_account_id text;
alter table public.meta_ads_integrations add column if not exists ad_account_name text;
alter table public.meta_ads_integrations add column if not exists ad_account_status integer;
alter table public.meta_ads_integrations add column if not exists currency text;
alter table public.meta_ads_integrations add column if not exists timezone_name text;
alter table public.meta_ads_integrations add column if not exists access_token_ciphertext text;
alter table public.meta_ads_integrations add column if not exists access_token_last4 text;
alter table public.meta_ads_integrations add column if not exists permissions text[] not null default '{}';
alter table public.meta_ads_integrations add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.meta_ads_integrations add column if not exists last_error text;
alter table public.meta_ads_integrations add column if not exists connected_at timestamptz;
alter table public.meta_ads_integrations add column if not exists last_synced_at timestamptz;

create table if not exists public.meta_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meta_channel_id uuid references public.meta_channels(id) on delete set null,
  meta_template_id text,
  template_name text not null,
  category text,
  language text not null,
  status text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, template_name, language)
);

alter table public.meta_templates add column if not exists meta_channel_id uuid references public.meta_channels(id) on delete set null;
alter table public.meta_templates add column if not exists meta_template_id text;
alter table public.meta_templates add column if not exists category text;
alter table public.meta_templates add column if not exists status text;
alter table public.meta_templates add column if not exists raw jsonb not null default '{}'::jsonb;

create unique index if not exists meta_templates_user_id_template_name_language_key
  on public.meta_templates (user_id, template_name, language);

create index if not exists meta_templates_channel_idx
  on public.meta_templates (meta_channel_id);

create index if not exists meta_templates_user_status_idx
  on public.meta_templates (user_id, status);

create table if not exists public.meta_flows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meta_channel_id uuid references public.meta_channels(id) on delete set null,
  meta_flow_id text,
  flow_name text not null,
  status text not null default 'DRAFT',
  categories text[] not null default '{}',
  field_schema jsonb not null default '[]'::jsonb,
  raw jsonb not null default '{}'::jsonb,
  preview_url text,
  preview_expires_at timestamptz,
  submission_count integer not null default 0,
  last_submitted_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, meta_flow_id)
);

create index if not exists meta_flows_user_updated_idx
  on public.meta_flows (user_id, updated_at desc);

create index if not exists meta_flows_status_idx
  on public.meta_flows (user_id, status);

create table if not exists public.flow_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meta_flow_id uuid references public.meta_flows(id) on delete set null,
  thread_id uuid,
  contact_id text,
  flow_token text,
  message_id text,
  responses jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.flow_submissions add column if not exists thread_id uuid;
alter table public.flow_submissions add column if not exists flow_token text;
alter table public.flow_submissions add column if not exists message_id text;

create index if not exists flow_submissions_user_submitted_idx
  on public.flow_submissions (user_id, submitted_at desc);

create index if not exists flow_submissions_flow_idx
  on public.flow_submissions (meta_flow_id, submitted_at desc);

create index if not exists flow_submissions_thread_idx
  on public.flow_submissions (thread_id, submitted_at desc);

create table if not exists public.meta_conversational_automation_configs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  meta_channel_id uuid references public.meta_channels(id) on delete set null,
  enable_welcome_message boolean not null default false,
  prompts text[] not null default '{}',
  commands jsonb not null default '[]'::jsonb,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meta_channel_id uuid references public.meta_channels(id) on delete set null,
  name text not null,
  is_enabled boolean not null default false,
  trigger_type text not null default 'incoming_message_keyword',
  keyword text not null,
  keyword_match_mode text not null default 'contains',
  action jsonb not null default '{}'::jsonb,
  last_triggered_at timestamptz,
  trigger_count integer not null default 0,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists automation_rules_user_updated_idx
  on public.automation_rules (user_id, updated_at desc);

create index if not exists automation_rules_enabled_idx
  on public.automation_rules (user_id, is_enabled)
  where is_enabled = true;

create table if not exists public.conversation_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meta_channel_id uuid references public.meta_channels(id) on delete set null,
  contact_wa_id text not null,
  contact_name text,
  username text,
  display_phone text,
  email text,
  source text,
  remark text,
  attributes jsonb not null default '{}'::jsonb,
  avatar_url text,
  status text not null default 'New',
  priority text not null default 'Medium',
  labels text[] not null default '{}',
  marketing_opted_out boolean not null default false,
  owner_name text,
  last_message_text text,
  last_message_at timestamptz,
  unread_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, contact_wa_id)
);

alter table public.conversation_threads add column if not exists email text;
alter table public.conversation_threads add column if not exists username text;
alter table public.conversation_threads add column if not exists source text;
alter table public.conversation_threads add column if not exists remark text;
alter table public.conversation_threads add column if not exists attributes jsonb not null default '{}'::jsonb;
alter table public.conversation_threads add column if not exists marketing_opted_out boolean not null default false;

create index if not exists conversation_threads_last_message_at_idx on public.conversation_threads (user_id, last_message_at desc);

create table if not exists public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid not null references public.conversation_threads(id) on delete cascade,
  wa_message_id text,
  direction text not null,
  message_type text not null,
  body text,
  sender_name text,
  sender_wa_id text,
  recipient_wa_id text,
  template_name text,
  status text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.conversation_messages add column if not exists wa_message_id text;
alter table public.conversation_messages add column if not exists sender_name text;
alter table public.conversation_messages add column if not exists sender_wa_id text;
alter table public.conversation_messages add column if not exists recipient_wa_id text;
alter table public.conversation_messages add column if not exists template_name text;
alter table public.conversation_messages add column if not exists status text;
alter table public.conversation_messages add column if not exists raw jsonb not null default '{}'::jsonb;
alter table public.conversation_messages add column if not exists updated_at timestamptz not null default timezone('utc', now());

create unique index if not exists conversation_messages_unique_meta_id
  on public.conversation_messages (user_id, wa_message_id)
  where wa_message_id is not null;

create index if not exists conversation_messages_thread_created_idx
  on public.conversation_messages (thread_id, created_at asc);

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null,
  type text not null check (type in ('addition', 'deduction')),
  amount numeric(12, 4) not null default 0,
  currency text not null default 'USD',
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references auth.users(id) on delete cascade,
  currency text not null default 'USD',
  available_balance numeric(12, 2) not null default 0,
  locked_balance numeric(12, 2) not null default 0,
  wallet_type text not null default 'platform' check (wallet_type in ('platform', 'campaign_estimate', 'partner_managed_waba')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (org_id, wallet_type)
);

create index if not exists wallets_user_id_idx on public.wallets (user_id);
create index if not exists wallets_org_id_idx on public.wallets (org_id);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  amount numeric(12, 2) not null default 0,
  currency text not null default 'USD',
  type text not null check (type in ('credit', 'debit', 'refund', 'adjustment')),
  source text not null check (source in ('razorpay', 'stripe', 'manual', 'system')),
  purpose text not null check (purpose in ('subscription', 'addon', 'campaign_estimate', 'waba_billing')),
  status text not null default 'pending' check (status in ('pending', 'successful', 'failed', 'refunded')),
  description text not null default 'Wallet activity',
  external_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists transactions_wallet_created_idx
  on public.transactions (wallet_id, created_at desc);

create index if not exists transactions_status_idx
  on public.transactions (status);

create table if not exists public.call_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  call_id text,
  name text,
  phone text not null,
  type text not null check (type in ('incoming', 'outgoing', 'missed')),
  duration_seconds integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.call_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meta_channel_id uuid references public.meta_channels(id) on delete set null,
  call_id text not null,
  contact_wa_id text,
  contact_name text,
  display_phone text,
  direction text not null default 'outgoing' check (direction in ('incoming', 'outgoing')),
  state text not null default 'dialing',
  offer_sdp text,
  answer_sdp text,
  biz_opaque_callback_data text,
  last_event text,
  raw jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default timezone('utc', now()),
  connected_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, call_id)
);

alter table public.call_logs add column if not exists call_id text;
alter table public.call_sessions add column if not exists connected_at timestamptz;

create unique index if not exists call_logs_user_call_id_key
  on public.call_logs (user_id, call_id);

create index if not exists call_sessions_user_updated_idx
  on public.call_sessions (user_id, updated_at desc);

create table if not exists public.meta_lead_capture_configs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  meta_channel_id uuid references public.meta_channels(id) on delete set null,
  status text not null default 'draft',
  app_id text,
  page_ids text[] not null default '{}',
  form_ids text[] not null default '{}',
  access_token_ciphertext text,
  access_token_last4 text,
  verify_token text not null,
  verified_at timestamptz,
  default_owner_name text,
  default_labels text[] not null default '{}',
  auto_create_leads boolean not null default true,
  last_webhook_at timestamptz,
  last_lead_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists meta_lead_capture_configs_verify_token_key
  on public.meta_lead_capture_configs (verify_token);

alter table public.meta_lead_capture_configs add column if not exists verified_at timestamptz;

create table if not exists public.meta_lead_capture_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  page_id text,
  form_id text,
  lead_id text,
  event_time timestamptz,
  processing_status text not null default 'received',
  error_message text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists meta_lead_capture_events_user_lead_id_key
  on public.meta_lead_capture_events (user_id, lead_id)
  where lead_id is not null;

create index if not exists meta_lead_capture_events_user_created_idx
  on public.meta_lead_capture_events (user_id, created_at desc);

create table if not exists public.razorpay_webhook_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_id text,
  event_name text not null,
  account_id text,
  entity_type text,
  entity_id text,
  payment_id text,
  order_id text,
  subscription_id text,
  invoice_id text,
  refund_id text,
  settlement_id text,
  event_created_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists razorpay_webhook_events_event_id_key
  on public.razorpay_webhook_events (event_id)
  where event_id is not null;

create index if not exists razorpay_webhook_events_user_created_idx
  on public.razorpay_webhook_events (user_id, created_at desc);

create index if not exists razorpay_webhook_events_event_created_idx
  on public.razorpay_webhook_events (event_name, created_at desc);

create index if not exists razorpay_webhook_events_entity_idx
  on public.razorpay_webhook_events (entity_type, entity_id);

create table if not exists public.workspace_team_members (
  id uuid primary key default gen_random_uuid(),
  workspace_owner_user_id uuid not null references auth.users(id) on delete cascade,
  member_user_id uuid references auth.users(id) on delete set null,
  invited_by_user_id uuid references auth.users(id) on delete set null,
  invited_email text not null,
  full_name text,
  role text not null default 'Agent',
  status text not null default 'invited',
  invite_sent_at timestamptz not null default timezone('utc', now()),
  accepted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists workspace_team_members_owner_email_key
  on public.workspace_team_members (workspace_owner_user_id, invited_email);

create index if not exists workspace_team_members_owner_idx
  on public.workspace_team_members (workspace_owner_user_id, created_at desc);

create index if not exists workspace_team_members_member_idx
  on public.workspace_team_members (member_user_id);

create table if not exists public.workspace_option_definitions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('label', 'attribute')),
  name text not null,
  value_type text not null default 'text',
  options text[] not null default '{}',
  color text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workspace_option_definitions_user_type_idx
  on public.workspace_option_definitions (user_id, type, created_at desc);

create unique index if not exists workspace_option_definitions_user_type_name_key
  on public.workspace_option_definitions (user_id, type, lower(name));

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('incoming_message', 'incoming_email', 'template_approved', 'template_rejected', 'missed_call', 'lead_created', 'campaign_sent', 'email_campaign_sent', 'display_name_approved', 'team_member_joined')),
  title text not null,
  body text not null,
  target_path text,
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.user_notifications
  drop constraint if exists user_notifications_type_check;

alter table public.user_notifications
  add constraint user_notifications_type_check
  check (type in ('incoming_message', 'incoming_email', 'template_approved', 'template_rejected', 'missed_call', 'lead_created', 'campaign_sent', 'email_campaign_sent', 'display_name_approved', 'team_member_joined'));

create unique index if not exists user_notifications_user_dedupe_key
  on public.user_notifications (user_id, dedupe_key)
  where dedupe_key is not null;

create index if not exists user_notifications_user_created_idx
  on public.user_notifications (user_id, created_at desc);

create index if not exists user_notifications_user_unread_idx
  on public.user_notifications (user_id, is_read, created_at desc);

create table if not exists public.user_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  sound_enabled boolean not null default true,
  call_sound_enabled boolean not null default true,
  sound_preset text not null default 'classic' check (sound_preset in ('classic', 'soft', 'pulse')),
  volume numeric(4, 2) not null default 0.8,
  incoming_message_enabled boolean not null default true,
  incoming_email_enabled boolean not null default true,
  template_review_enabled boolean not null default true,
  missed_call_enabled boolean not null default true,
  lead_enabled boolean not null default true,
  campaign_sent_enabled boolean not null default true,
  email_campaign_enabled boolean not null default true,
  display_name_approved_enabled boolean not null default true,
  team_joined_enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.user_notification_preferences
  add column if not exists incoming_message_enabled boolean not null default true;

alter table public.user_notification_preferences
  add column if not exists incoming_email_enabled boolean not null default true;

alter table public.user_notification_preferences
  add column if not exists campaign_sent_enabled boolean not null default true;

alter table public.user_notification_preferences
  add column if not exists email_campaign_enabled boolean not null default true;

alter table public.user_notification_preferences
  add column if not exists display_name_approved_enabled boolean not null default true;

create table if not exists public.developer_api_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'REST API key',
  api_key text not null unique,
  secret_hash text not null,
  secret_last4 text not null,
  scopes text[] not null default array['messages:read', 'messages:write', 'contacts:read', 'contacts:write', 'webhooks:manage']::text[],
  status text not null default 'active' check (status in ('active', 'revoked')),
  last_used_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists developer_api_credentials_user_created_idx
  on public.developer_api_credentials (user_id, created_at desc);

create table if not exists public.developer_webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Webhook endpoint',
  url text not null,
  events text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'paused')),
  signing_secret_ciphertext text not null,
  signing_secret_last4 text not null,
  last_delivery_at timestamptz,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists developer_webhook_endpoints_user_created_idx
  on public.developer_webhook_endpoints (user_id, created_at desc);

create table if not exists public.woocommerce_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  store_name text,
  store_url text not null,
  consumer_key_ciphertext text not null,
  consumer_key_last4 text not null,
  consumer_secret_ciphertext text not null,
  consumer_secret_last4 text not null,
  webhook_secret_ciphertext text not null,
  webhook_secret_last4 text not null,
  status text not null default 'connected' check (status in ('connected', 'error', 'disconnected')),
  automations jsonb not null default '[]'::jsonb,
  last_verified_at timestamptz,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.email_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  email_address text not null,
  auth_user text not null,
  password_ciphertext text not null,
  smtp_host text not null,
  smtp_port integer not null,
  smtp_secure boolean not null default true,
  imap_host text not null,
  imap_port integer not null,
  imap_secure boolean not null default true,
  status text not null default 'connected',
  last_verified_at timestamptz,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  subject text not null,
  editor_mode text not null default 'rich',
  html_content text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists email_templates_user_updated_idx
  on public.email_templates (user_id, updated_at desc);

create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email_template_id uuid references public.email_templates(id) on delete set null,
  template_name text,
  campaign_name text not null,
  subject text not null,
  html_content text not null default '',
  audience_source text not null default 'contacts',
  recipient_count integer not null default 0,
  status text not null default 'sent',
  sent_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.email_campaigns add column if not exists template_name text;

create index if not exists email_campaigns_user_created_idx
  on public.email_campaigns (user_id, created_at desc);

drop trigger if exists app_profiles_set_updated_at on public.app_profiles;
create trigger app_profiles_set_updated_at
before update on public.app_profiles
for each row execute function public.set_updated_at();

drop trigger if exists meta_channels_set_updated_at on public.meta_channels;
create trigger meta_channels_set_updated_at
before update on public.meta_channels
for each row execute function public.set_updated_at();

drop trigger if exists instagram_channels_set_updated_at on public.instagram_channels;
create trigger instagram_channels_set_updated_at
before update on public.instagram_channels
for each row execute function public.set_updated_at();

drop trigger if exists messenger_channels_set_updated_at on public.messenger_channels;
create trigger messenger_channels_set_updated_at
before update on public.messenger_channels
for each row execute function public.set_updated_at();

drop trigger if exists meta_ads_integrations_set_updated_at on public.meta_ads_integrations;
create trigger meta_ads_integrations_set_updated_at
before update on public.meta_ads_integrations
for each row execute function public.set_updated_at();

drop trigger if exists meta_templates_set_updated_at on public.meta_templates;
create trigger meta_templates_set_updated_at
before update on public.meta_templates
for each row execute function public.set_updated_at();

drop trigger if exists meta_flows_set_updated_at on public.meta_flows;
create trigger meta_flows_set_updated_at
before update on public.meta_flows
for each row execute function public.set_updated_at();

drop trigger if exists flow_submissions_set_updated_at on public.flow_submissions;
create trigger flow_submissions_set_updated_at
before update on public.flow_submissions
for each row execute function public.set_updated_at();

drop trigger if exists meta_conversational_automation_configs_set_updated_at on public.meta_conversational_automation_configs;
create trigger meta_conversational_automation_configs_set_updated_at
before update on public.meta_conversational_automation_configs
for each row execute function public.set_updated_at();

drop trigger if exists automation_rules_set_updated_at on public.automation_rules;
create trigger automation_rules_set_updated_at
before update on public.automation_rules
for each row execute function public.set_updated_at();

drop trigger if exists conversation_threads_set_updated_at on public.conversation_threads;
create trigger conversation_threads_set_updated_at
before update on public.conversation_threads
for each row execute function public.set_updated_at();

drop trigger if exists conversation_messages_set_updated_at on public.conversation_messages;
create trigger conversation_messages_set_updated_at
before update on public.conversation_messages
for each row execute function public.set_updated_at();

drop trigger if exists wallets_set_updated_at on public.wallets;
create trigger wallets_set_updated_at
before update on public.wallets
for each row execute function public.set_updated_at();

drop trigger if exists transactions_set_updated_at on public.transactions;
create trigger transactions_set_updated_at
before update on public.transactions
for each row execute function public.set_updated_at();

drop trigger if exists call_sessions_set_updated_at on public.call_sessions;
create trigger call_sessions_set_updated_at
before update on public.call_sessions
for each row execute function public.set_updated_at();

drop trigger if exists meta_lead_capture_configs_set_updated_at on public.meta_lead_capture_configs;
create trigger meta_lead_capture_configs_set_updated_at
before update on public.meta_lead_capture_configs
for each row execute function public.set_updated_at();

drop trigger if exists workspace_team_members_set_updated_at on public.workspace_team_members;
create trigger workspace_team_members_set_updated_at
before update on public.workspace_team_members
for each row execute function public.set_updated_at();

drop trigger if exists workspace_option_definitions_set_updated_at on public.workspace_option_definitions;
create trigger workspace_option_definitions_set_updated_at
before update on public.workspace_option_definitions
for each row execute function public.set_updated_at();

drop trigger if exists user_notifications_set_updated_at on public.user_notifications;
create trigger user_notifications_set_updated_at
before update on public.user_notifications
for each row execute function public.set_updated_at();

drop trigger if exists user_notification_preferences_set_updated_at on public.user_notification_preferences;
create trigger user_notification_preferences_set_updated_at
before update on public.user_notification_preferences
for each row execute function public.set_updated_at();

drop trigger if exists developer_api_credentials_set_updated_at on public.developer_api_credentials;
create trigger developer_api_credentials_set_updated_at
before update on public.developer_api_credentials
for each row execute function public.set_updated_at();

drop trigger if exists developer_webhook_endpoints_set_updated_at on public.developer_webhook_endpoints;
create trigger developer_webhook_endpoints_set_updated_at
before update on public.developer_webhook_endpoints
for each row execute function public.set_updated_at();

drop trigger if exists woocommerce_connections_set_updated_at on public.woocommerce_connections;
create trigger woocommerce_connections_set_updated_at
before update on public.woocommerce_connections
for each row execute function public.set_updated_at();

drop trigger if exists email_connections_set_updated_at on public.email_connections;
create trigger email_connections_set_updated_at
before update on public.email_connections
for each row execute function public.set_updated_at();

drop trigger if exists email_templates_set_updated_at on public.email_templates;
create trigger email_templates_set_updated_at
before update on public.email_templates
for each row execute function public.set_updated_at();

drop trigger if exists email_campaigns_set_updated_at on public.email_campaigns;
create trigger email_campaigns_set_updated_at
before update on public.email_campaigns
for each row execute function public.set_updated_at();

alter table public.app_profiles enable row level security;
alter table public.meta_channels enable row level security;
alter table public.instagram_channels enable row level security;
alter table public.messenger_channels enable row level security;
alter table public.meta_ads_integrations enable row level security;
alter table public.meta_templates enable row level security;
alter table public.meta_flows enable row level security;
alter table public.flow_submissions enable row level security;
alter table public.meta_conversational_automation_configs enable row level security;
alter table public.automation_rules enable row level security;
alter table public.conversation_threads enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.wallets enable row level security;
alter table public.transactions enable row level security;
alter table public.call_logs enable row level security;
alter table public.call_sessions enable row level security;
alter table public.meta_lead_capture_configs enable row level security;
alter table public.meta_lead_capture_events enable row level security;
alter table public.razorpay_webhook_events enable row level security;
alter table public.workspace_team_members enable row level security;
alter table public.workspace_option_definitions enable row level security;
alter table public.user_notifications enable row level security;
alter table public.user_notification_preferences enable row level security;
alter table public.developer_api_credentials enable row level security;
alter table public.developer_webhook_endpoints enable row level security;
alter table public.woocommerce_connections enable row level security;
alter table public.email_connections enable row level security;
alter table public.email_templates enable row level security;
alter table public.email_campaigns enable row level security;

drop policy if exists app_profiles_self_access on public.app_profiles;
create policy app_profiles_self_access
on public.app_profiles
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists workspace_option_definitions_self_access on public.workspace_option_definitions;
create policy workspace_option_definitions_self_access
on public.workspace_option_definitions
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists meta_channels_self_access on public.meta_channels;
create policy meta_channels_self_access
on public.meta_channels
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists instagram_channels_self_access on public.instagram_channels;
create policy instagram_channels_self_access
on public.instagram_channels
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists messenger_channels_self_access on public.messenger_channels;
create policy messenger_channels_self_access
on public.messenger_channels
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists meta_ads_integrations_self_access on public.meta_ads_integrations;
create policy meta_ads_integrations_self_access
on public.meta_ads_integrations
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists meta_templates_self_access on public.meta_templates;
create policy meta_templates_self_access
on public.meta_templates
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists meta_flows_self_access on public.meta_flows;
create policy meta_flows_self_access
on public.meta_flows
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists flow_submissions_self_access on public.flow_submissions;
create policy flow_submissions_self_access
on public.flow_submissions
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists meta_conversational_automation_configs_self_access on public.meta_conversational_automation_configs;
create policy meta_conversational_automation_configs_self_access
on public.meta_conversational_automation_configs
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists automation_rules_self_access on public.automation_rules;
create policy automation_rules_self_access
on public.automation_rules
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists conversation_threads_self_access on public.conversation_threads;
create policy conversation_threads_self_access
on public.conversation_threads
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists conversation_messages_self_access on public.conversation_messages;
create policy conversation_messages_self_access
on public.conversation_messages
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists meta_lead_capture_configs_self_access on public.meta_lead_capture_configs;
create policy meta_lead_capture_configs_self_access
on public.meta_lead_capture_configs
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists meta_lead_capture_events_self_access on public.meta_lead_capture_events;
create policy meta_lead_capture_events_self_access
on public.meta_lead_capture_events
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists razorpay_webhook_events_self_access on public.razorpay_webhook_events;
create policy razorpay_webhook_events_self_access
on public.razorpay_webhook_events
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists credit_ledger_self_access on public.credit_ledger;
create policy credit_ledger_self_access
on public.credit_ledger
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists wallets_workspace_access on public.wallets;
create policy wallets_workspace_access
on public.wallets
for all
using (
  auth.uid() = user_id
  or auth.uid() = org_id
  or exists (
    select 1
    from public.workspace_team_members
    where workspace_owner_user_id = wallets.org_id
      and member_user_id = auth.uid()
      and status = 'active'
  )
)
with check (
  auth.uid() = user_id
  or auth.uid() = org_id
  or exists (
    select 1
    from public.workspace_team_members
    where workspace_owner_user_id = wallets.org_id
      and member_user_id = auth.uid()
      and status = 'active'
  )
);

drop policy if exists transactions_workspace_access on public.transactions;
create policy transactions_workspace_access
on public.transactions
for all
using (
  exists (
    select 1
    from public.wallets
    where wallets.id = transactions.wallet_id
      and (
        auth.uid() = wallets.user_id
        or auth.uid() = wallets.org_id
        or exists (
          select 1
          from public.workspace_team_members
          where workspace_owner_user_id = wallets.org_id
            and member_user_id = auth.uid()
            and status = 'active'
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.wallets
    where wallets.id = transactions.wallet_id
      and (
        auth.uid() = wallets.user_id
        or auth.uid() = wallets.org_id
        or exists (
          select 1
          from public.workspace_team_members
          where workspace_owner_user_id = wallets.org_id
            and member_user_id = auth.uid()
            and status = 'active'
        )
      )
  )
);

drop policy if exists call_logs_self_access on public.call_logs;
create policy call_logs_self_access
on public.call_logs
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists call_sessions_self_access on public.call_sessions;
create policy call_sessions_self_access
on public.call_sessions
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists workspace_team_members_access on public.workspace_team_members;
create policy workspace_team_members_access
on public.workspace_team_members
for all
using (
  auth.uid() = workspace_owner_user_id
  or auth.uid() = member_user_id
)
with check (auth.uid() = workspace_owner_user_id);

drop policy if exists user_notifications_self_access on public.user_notifications;
create policy user_notifications_self_access
on public.user_notifications
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists user_notification_preferences_self_access on public.user_notification_preferences;
create policy user_notification_preferences_self_access
on public.user_notification_preferences
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists developer_api_credentials_self_access on public.developer_api_credentials;
create policy developer_api_credentials_self_access
on public.developer_api_credentials
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists developer_webhook_endpoints_self_access on public.developer_webhook_endpoints;
create policy developer_webhook_endpoints_self_access
on public.developer_webhook_endpoints
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists woocommerce_connections_self_access on public.woocommerce_connections;
create policy woocommerce_connections_self_access
on public.woocommerce_connections
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists email_connections_self_access on public.email_connections;
create policy email_connections_self_access
on public.email_connections
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists email_templates_self_access on public.email_templates;
create policy email_templates_self_access
on public.email_templates
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists email_campaigns_self_access on public.email_campaigns;
create policy email_campaigns_self_access
on public.email_campaigns
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'conversation_threads'
    ) then
      alter publication supabase_realtime add table public.conversation_threads;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'conversation_messages'
    ) then
      alter publication supabase_realtime add table public.conversation_messages;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'call_logs'
    ) then
      alter publication supabase_realtime add table public.call_logs;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'call_sessions'
    ) then
      alter publication supabase_realtime add table public.call_sessions;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'user_notifications'
    ) then
      alter publication supabase_realtime add table public.user_notifications;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'user_notification_preferences'
    ) then
      alter publication supabase_realtime add table public.user_notification_preferences;
    end if;
  end if;
end
$$;
    
