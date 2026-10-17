-- Shared limit for coexistence Cloud API sends: one slot every 50ms (20 mps).
create table if not exists public.whatsapp_coexistence_send_slots (
  phone_number_id text primary key,
  next_send_at timestamptz not null default now()
);
alter table public.whatsapp_coexistence_send_slots enable row level security;
revoke all on public.whatsapp_coexistence_send_slots from public, anon, authenticated;
grant all on public.whatsapp_coexistence_send_slots to service_role;

create or replace function public.acquire_whatsapp_coexistence_send_slot(p_phone_number_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_next timestamptz;
  v_now timestamptz;
begin
  if p_phone_number_id !~ '^[0-9]+$' then raise exception 'Invalid phone number ID'; end if;
  insert into public.whatsapp_coexistence_send_slots(phone_number_id) values(p_phone_number_id)
    on conflict do nothing;
  select next_send_at into v_next from public.whatsapp_coexistence_send_slots
    where phone_number_id = p_phone_number_id for update;
  v_now := clock_timestamp();
  if v_next > v_now then
    return jsonb_build_object('acquired', false, 'retryAfterMs', ceil(extract(epoch from (v_next-v_now))*1000));
  end if;
  update public.whatsapp_coexistence_send_slots set next_send_at = v_now + interval '50 milliseconds'
    where phone_number_id = p_phone_number_id;
  return jsonb_build_object('acquired', true, 'retryAfterMs', 0);
end;
$$;
revoke all on function public.acquire_whatsapp_coexistence_send_slot(text) from public, anon, authenticated;
grant execute on function public.acquire_whatsapp_coexistence_send_slot(text) to service_role;
