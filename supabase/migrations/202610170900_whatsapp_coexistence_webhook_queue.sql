-- Signed Meta changes are durably acknowledged before imports are processed.
-- No client policies: all operations require the backend service role.
create table if not exists public.whatsapp_coexistence_webhook_jobs (
  id text primary key,
  partition_key text not null,
  waba_id text,
  phone_number_id text,
  field text not null,
  entry_time timestamptz,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_by uuid,
  locked_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.whatsapp_coexistence_webhook_jobs enable row level security;
revoke all on public.whatsapp_coexistence_webhook_jobs from public, anon, authenticated;
grant all on public.whatsapp_coexistence_webhook_jobs to service_role;
create index if not exists whatsapp_coexistence_webhook_jobs_pending_idx
  on public.whatsapp_coexistence_webhook_jobs (next_attempt_at, created_at) where status <> 'completed';
create index if not exists whatsapp_coexistence_webhook_jobs_partition_idx
  on public.whatsapp_coexistence_webhook_jobs (partition_key, locked_until) where status = 'processing';

create or replace function public.claim_whatsapp_coexistence_webhook_job(p_worker_id uuid, p_lease_seconds integer default 300)
returns setof public.whatsapp_coexistence_webhook_jobs
language plpgsql security definer set search_path = public, pg_temp as $$
declare candidate public.whatsapp_coexistence_webhook_jobs;
begin
  for candidate in
    select j.* from public.whatsapp_coexistence_webhook_jobs j
    where (j.status = 'pending' and j.next_attempt_at <= now())
       or (j.status = 'processing' and j.locked_until <= now())
    order by j.next_attempt_at, j.created_at limit 100
  loop
    -- Transaction advisory lock serializes claims for each phone, including
    -- multiple API instances; the persisted lease protects work after commit.
    if not pg_try_advisory_xact_lock(hashtextextended(candidate.partition_key, 0)) then continue; end if;
    if exists (select 1 from public.whatsapp_coexistence_webhook_jobs j
      where j.partition_key = candidate.partition_key and j.status = 'processing'
        and j.locked_until > now()) then continue; end if;
    return query update public.whatsapp_coexistence_webhook_jobs j set
      status = 'processing', attempts = j.attempts + 1, locked_by = p_worker_id,
      locked_until = now() + make_interval(secs => greatest(30, least(p_lease_seconds, 900))), updated_at = now()
      where j.id = candidate.id and ((j.status = 'pending' and j.next_attempt_at <= now())
        or (j.status = 'processing' and j.locked_until <= now())) returning j.*;
    if found then return; end if;
  end loop;
end $$;

create or replace function public.renew_whatsapp_coexistence_webhook_job(p_job_id text, p_worker_id uuid, p_lease_seconds integer default 300)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.whatsapp_coexistence_webhook_jobs set
    locked_until = now() + make_interval(secs => greatest(30, least(p_lease_seconds, 900))), updated_at = now()
  where id = p_job_id and status = 'processing' and locked_by = p_worker_id and locked_until > now();
  return found;
end $$;

create or replace function public.finish_whatsapp_coexistence_webhook_job(p_job_id text, p_worker_id uuid, p_error text default null, p_retry_seconds integer default 60)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.whatsapp_coexistence_webhook_jobs set
    status = case when p_error is null then 'completed' else 'pending' end,
    last_error = p_error, next_attempt_at = now() + make_interval(secs => greatest(1, least(p_retry_seconds, 3600))),
    locked_by = null, locked_until = null, updated_at = now(),
    completed_at = case when p_error is null then now() else null end
  where id = p_job_id and status = 'processing' and locked_by = p_worker_id and locked_until > now();
  return found;
end $$;

revoke all on function public.claim_whatsapp_coexistence_webhook_job(uuid, integer) from public, anon, authenticated;
revoke all on function public.renew_whatsapp_coexistence_webhook_job(text, uuid, integer) from public, anon, authenticated;
revoke all on function public.finish_whatsapp_coexistence_webhook_job(text, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.claim_whatsapp_coexistence_webhook_job(uuid, integer) to service_role;
grant execute on function public.renew_whatsapp_coexistence_webhook_job(text, uuid, integer) to service_role;
grant execute on function public.finish_whatsapp_coexistence_webhook_job(text, uuid, text, integer) to service_role;
