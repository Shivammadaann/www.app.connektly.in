# Connektly Frontend + Meta Integration

This repo now includes:

- The Vite frontend.
- An Express API server in [server.ts](/c:/Users/Shiva/Downloads/connektly%20(4)/server.ts).
- Supabase persistence schema in [supabase/schema.sql](/c:/Users/Shiva/Downloads/connektly%20(4)/supabase/schema.sql).
- A first-pass real Meta WhatsApp Cloud API integration for:
  - onboarding profile persistence
  - embedded signup or manual WhatsApp connection
  - live template sync/create/duplicate/delete
  - webhook ingestion for inbound messages and statuses
  - inbox message send/start conversation flows
- A first-pass Meta Messenger Platform connection for:
  - Facebook Page selection through Meta login
  - encrypted Page access token storage
  - Messenger webhook endpoint verification and Page subscription scaffolding

## Required setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` into your local env file and fill in:
   - Supabase URL, anon key, service role key
   - Meta app id, app secret, config id
   - webhook verify token
   - token encryption key
3. Apply [supabase/schema.sql](/c:/Users/Shiva/Downloads/connektly%20(4)/supabase/schema.sql) to your Supabase database.
4. Run the API with `npm run dev:api`.
5. Run the frontend with `npm run dev:client`.

## Production notes

- The API expects Supabase auth bearer tokens from the frontend and uses the service role key server-side.
- Meta access tokens are stored encrypted when `META_TOKEN_ENCRYPTION_KEY` is set.
- `VITE_API_PROXY_TARGET` defaults to `http://127.0.0.1:3001` in local dev.
- The production build can be served by the same API server after `npm run build`.

## Remaining gaps

- Team management is still single-user only.
- Credits need a billing/top-up backend to populate `credit_ledger`.
- Calls currently read persisted `call_logs`, but provider-specific call automation is not implemented yet.
- Instagram inbox, Messenger inbox/message sync, broadcasts, flows, automations, commerce, and CRM routes still need their own backend integrations.
