alter table public.conversation_threads
  add column if not exists username text;

update public.conversation_threads
set username = case
  when lower(coalesce(source, '')) = 'instagram' and nullif(trim(display_phone), '') is not null then trim(display_phone)
  when lower(coalesce(source, '')) = 'messenger' and nullif(trim(contact_name), '') is not null then trim(contact_name)
  else username
end
where username is null
  and lower(coalesce(source, '')) in ('instagram', 'messenger');
