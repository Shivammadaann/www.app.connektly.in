# WhatsApp Embedded Signup

This integration implements Meta's standard Cloud API Embedded Signup flow for
Connektly as a Tech Provider. Customers own their assets and add their own payment
method in WhatsApp Manager. Coexistence, multi-WABA, and phone-number bypass flows
require their own configuration and onboarding logic; they are reported explicitly
instead of being treated as a successful messaging connection.

## Meta Dashboard setup

For app **797649033413847**, confirm these external settings before testing:

1. Under **Facebook Login for Business → Settings**, enable Client OAuth login,
   Web OAuth login, Enforce HTTPS, Embedded Browser OAuth Login, strict redirect
   URIs, and Login with the JavaScript SDK.
2. Add the production HTTPS host to **Allowed domains for the JavaScript SDK**.
   Add the exact page that launches signup to **Valid OAuth redirect URIs**, for
   example `https://app.connektly.in/onboarding/channel-connection`.
   Retain any existing Supabase callback URI used for account sign-in.
3. Confirm configuration **959911236622056** uses the **WhatsApp Embedded Signup**
   login variation and the **WhatsApp Embedded Signup Configuration With 60 Expiration Token**
   template (or an equivalent configuration for the Cloud API). Request only the
   required WhatsApp assets and `whatsapp_business_management` and
   `whatsapp_business_messaging` permissions. Do not add unrelated Page, ad, or
   catalog requirements to this configuration.
4. The launcher explicitly sets `extras.version: 'v4'` and
   `extras.sessionInfoVersion: 3`. The session-info schema is independent of the
   Embedded Signup flow version; schema 3 is supported with signup v4. If a
   replacement configuration is needed later, update
   `WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID` in `src/lib/whatsapp-onboarding.ts`.
   Both the browser and API use that shared ID. Graph API `v25.0` is another,
   separate version setting.
5. Configure the app's **WhatsApp Business Account** webhook callback as
   `https://app.connektly.in/api/meta/webhook` with the server's
   `META_WEBHOOK_VERIFY_TOKEN`. Subscribe at least to `messages` and
   `account_update`; retain other fields used by existing features, including
   phone number name updates. WABA subscriptions use this app-level callback
   without generating an override for each customer.
6. For customer accounts outside app roles, confirm the app is live and the
   required permissions have Advanced Access, with the necessary business,
   access, and Tech Provider verification completed.

The API needs `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, and
`META_TOKEN_ENCRYPTION_KEY`. Browser and server Graph API settings should agree.
Embedded Signup must be tested on HTTPS; an HTTP localhost page cannot receive
the production flow correctly.

## Connection sequence

1. Preload and initialize the JavaScript SDK. The user's click calls `FB.login`
   synchronously with `config_id`, `response_type: 'code'`,
   `override_default_response_type: true`, and
   `extras: { setup: {}, version: 'v4', sessionInfoVersion: 3 }`.
2. Capture Meta's `FINISH` message independently from the login callback. Accept
   only HTTPS Facebook origins, and handle cancellation, reported errors,
   missing details, timeout, and closing the Connektly modal.
3. Immediately send the code to the authenticated
   `POST /api/meta/connect/embedded/exchange` endpoint. Meta gives the code a
   30-second lifetime, so this step does not wait for the asset message.
4. The API exchanges the code once, without a `redirect_uri`, and returns an
   opaque AES-GCM-encrypted ticket valid for ten minutes. It binds the business
   token to the signed-in user, app, configuration, and signup state. The raw
   business token is never returned to the browser. No new database table is
   required for this temporary handoff.
5. Submit the ticket and account details to `POST /api/meta/connect/embedded`.
   The API verifies the ticket and confirms the phone belongs to the WABA, saves
   the encrypted business token, registers the phone using a stored or generated
   six-digit PIN, and subscribes the app to the WABA's webhooks.
6. The connection remains `pending` if registration or subscription fails. A
   retry reuses the saved connection and skips registration if it already
   succeeded. Initial template-sync failure does not undo a completed connection.
7. Review the optional public profile, then open WhatsApp Manager to add or
   confirm the customer's payment method. A successful technical connection is
   not a confirmation that Meta billing is configured.

Incoming Meta webhooks must carry a valid `X-Hub-Signature-256` signature.
`account_update` events for saved WABAs are retained in channel metadata.

## Verification

Run `npm run lint` and `npm run test:embedded-signup`. The tests simulate Meta
callbacks and Graph API responses; a real completion must also be tested with
an app-role account or Meta's sandbox through the configured HTTPS domain.
Sandbox phone numbers cannot send or receive real messages.

On October 17, 2026, Meta's Embedded Signup Builder validated the selected
`whatsapp_onboarding` configuration with version v4 and session-info schema 3
before and after the October 15 deprecation. Its selected products were
`cloud_api` and `marketing_messages_lite`, with Business app onboarding and
WABA-only sharing off. The production onboarding redirect URI, JS SDK domain,
OAuth toggles, and active `messages`/`account_update` webhook subscriptions were
also inspected without changing the app's settings.
