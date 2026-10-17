# WhatsApp Embedded Signup and coexistence

Connektly is a **Meta Tech Provider**. New Facebook Embedded Signup connections
use the active **Connektly Gupshup OD** Multi-Partner Solution **1287084176407435**:
Connektly app **797649033413847** owns the solution; OneDirect app
**340384197887925** provides messaging and calling permissions. Connektly retains
template and phone-asset management. Both exclusive and coexistence signup use
this solution. Existing direct Meta/manual connections retain their direct route
and customer payment method; this integration does not migrate them.

Partner customers use the Solution Partner's credit line. The documented Gupshup
SDK API provisions new apps in partner **4607**, wallet **Connektly**. This provider
wallet is separate from Connektly's customer platform subscriptions and internal
wallet feature flags. Do not enable global partner-billing flags to migrate
existing direct customers.

| Mode | Customer experience | Phone registration | After connection |
| --- | --- | --- | --- |
| Cloud API only (`exclusive`) | Connect a number for the WhatsApp Business Platform | New partner signup provisions through Gupshup; existing direct connections retain their PIN flow | Optional public profile editing, then review the connection's billing route |
| Business app + Cloud API (`coexistence`) | Connect an existing WhatsApp Business app number and keep using the app | **Never register, deregister, request phone verification codes, or set a PIN through Connektly's Cloud API** | Confirm partner callbacks, request contacts/shared history, show synchronization and partner billing status |

Multi-WABA sharing and the phone-number bypass flow are not supported. A
`FINISH_ONLY_WABA` event is rejected. A coexistence completion that supplies only
its WABA ID is different: the server resolves and verifies the matching Business
app phone number before saving the connection.

## Meta configuration and deployment

The app ID is **797649033413847**. Both modes use configuration
**959911236622056**, Embedded Signup **v4**, session-info schema **3**, and Graph
API **v25.0**. These version settings are independent.

1. In **Facebook Login for Business > Settings**, enable Client OAuth login,
   Web OAuth login, Enforce HTTPS, Embedded Browser OAuth Login, strict redirect
   URIs, and Login with the JavaScript SDK. Allow the production HTTPS host for
   the JavaScript SDK and the exact signup page as a valid OAuth redirect URI,
   such as `https://app.connektly.in/onboarding/channel-connection`. Retain the
   Supabase callback URI used for ordinary account sign-in.
2. Confirm the selected configuration is a WhatsApp Embedded Signup variation
   with access to the required WhatsApp assets and
   `whatsapp_business_management` / `whatsapp_business_messaging` permissions.
   For customers outside app roles, the app must be live with the required
   Advanced Access, business verification, and Tech Provider requirements.
3. Configure the WhatsApp Business Account webhook callback as
   `https://app.connektly.in/api/meta/webhook` using
   `META_WEBHOOK_VERIFY_TOKEN`. Subscribe at app level to **`messages`,
   `account_update`, `partner_solutions`, `history`, `smb_app_state_sync`, and `smb_message_echoes`**.
   Keep all existing subscriptions needed by other platform features. WABA
   subscription alone does not enable missing app-level webhook fields.
4. Apply both database migrations before enabling coexistence onboarding:
   - `supabase/migrations/202610170900_whatsapp_coexistence_webhook_queue.sql`
   - `supabase/migrations/202610170910_whatsapp_coexistence_rate_limit.sql`

   They create the service-role-only durable import queue, worker lease RPCs,
   and shared per-phone sending slots. The existing `meta_channels.metadata`
   stores onboarding and synchronization state. Missing queue storage/RPCs
   stops activation before initial synchronization requests are sent.
5. Configure `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`,
   `META_TOKEN_ENCRYPTION_KEY`, `GUPSHUP_PARTNER_TOKEN` (Universal Token),
   `GUPSHUP_PARTNER_ID=4607`, `GUPSHUP_WALLET_NAME=Connektly`,
   `GUPSHUP_WEBHOOK_SECRET`, and the existing Supabase service-role settings
   on the API. Browser and API Graph version settings must agree. Deploy the
   rebuilt frontend and API together, and restart the API so the webhook
   worker runs. `npm run dev:api` runs the development API; production uses the
   normal built-server deployment.

Use the public HTTPS `FRONTEND_ORIGIN` for callbacks. Gupshup v3 subscriptions
use `/api/gupshup/webhook/{providerAppId}` and an app/channel-bound authentication
header derived from the server webhook secret. Credentials never enter Vite
configuration or channel metadata. Keep the Universal Token current in server
secrets. No additional app token needs to be generated for an existing valid UT.

For Render, set `GUPSHUP_PARTNER_TOKEN` in the **web service's Environment**
settings to the actual partner Universal Token. A local `.env` file is not the
Render runtime environment. Do not substitute a WhatsApp app API key, webhook
secret, or the `YOUR_UNIVERSAL_TOKEN` template value. Save the setting and restart
or redeploy the API so it reads the updated credential. The client normalizes
accidental wrapping quotes or a `Bearer ` prefix, then applies each endpoint's
documented header format.

Before a new Facebook signup, authenticated
`GET /api/meta/partner/authentication` checks Gupshup's documented
`GET /partner/account/api/partnerApps`, using the raw Universal Token in the
`Authorization` header and validating `status: success` plus `partnerAppsList`.
Only readiness and its check time reach the customer; other customers' app
records remain on the server. Activation reconciles this linked-app inventory
with the paginated `GET /partner/app/list` endpoint, whose `token` header and
contains-style phone filter are separate API contracts. Full normalized phone
matches are deduplicated by app ID; multiple distinct matches stop activation.
A provider authentication rejection produces a service-readiness
error, without signing the Connektly user out or starting another Meta signup.
An app-list 401 occurs **before app creation** and says nothing about the wallet.
Explicit SDK creation 401/403 responses are saved as rejected attempts and may
be retried after authentication is corrected; transport failures, missing IDs,
HTML responses and other uncertain creation outcomes remain protected from
automatic replay.

Passing this authentication check does **not** establish SDK provisioning
availability. The Client Secret is used by the separate legacy login API to
issue a 24-hour partner token; a valid Universal Token can call the partner APIs
directly and does not require that login or an additional app token. Keep the
Client Secret out of browser configuration and source control.
References: [Get Partner Apps](https://partner-docs.gupshup.io/reference/get_partner-account-api-partnerapps)
and [Universal Token authentication](https://partner-docs.gupshup.io/docs/partner-authentication-guide-universal-tokens-ut-overview).

### SDK onboarding versus Partner Portal onboarding

This implementation hosts Meta signup in Connektly and uses the **SDK app
creation API** after the customer grants the shared solution access. The
attached `POST /partner/app` endpoint creates a sandbox app for a different,
Gupshup-hosted journey: create sandbox app, set contact details, verify its email
OTP, and generate a signed Embedded Signup link. Contact/OTP and that legacy
sandbox creation sequence are **not invoked by Connektly's SDK journey**.
Do not call both creation APIs for one customer or claim that sandbox creation
has linked a WABA, registered a phone, funded a wallet, or made the app live.
References: [Partner Portal onboarding](https://partner-docs.gupshup.io/docs/onboarding-apis),
[Create App](https://partner-docs.gupshup.io/reference/post_partner-app), and
[contact email verification](https://partner-docs.gupshup.io/reference/verifyappcontactemail).

The private `whatsapp-partner-media` Supabase storage bucket caches downloaded
provider media, with a 50 MiB object limit matching the current storage limit.
It is included in `schema.sql` and created privately on first use if absent.
The API refuses to use a public bucket with this name. Downloads are served
through the authenticated user/app route. Gupshup documents a download limit of
five requests per hour; cached objects avoid repeated provider requests. An
uncached expired or rate-limited object remains unavailable until the provider
allows retrieval. No private media URLs or provider tokens are exposed.

On **October 17, 2026**, the selected configuration was checked read-only in
Meta's Embedded Signup Builder with
`featureType: 'whatsapp_business_app_onboarding'`: both the current and
post-October-15 variants used v4, Business app onboarding was enabled, session
info was schema 3, and the products were `cloud_api` and
`marketing_messages_lite`. WABA-only sharing remained off. The coexistence
variant is enabled by the launch parameter; this check did not change a
persisted dashboard setting.

Use the configured **HTTPS** origin for real Meta onboarding. HTTP localhost
can be used for UI development and simulated tests, but cannot complete the
production Embedded Signup flow.

## Signup and activation sequence

1. The browser preloads the Facebook JavaScript SDK. The customer's click
   launches `FB.login` synchronously with the configured ID,
   `response_type: 'code'`, `override_default_response_type: true`, and
   `extras: { setup: { solutionID: '1287084176407435' }, version: 'v4', sessionInfoVersion: 3 }`.
2. For coexistence only, `extras` also includes
   `featureType: 'whatsapp_business_app_onboarding'`. The customer needs
   WhatsApp Business **2.24.17 or later**, access to their phone and business,
   and follows Meta's in-app verification/QR instructions. They choose
   whether to share previous individual chat history. Keep the Business app
   open throughout onboarding and synchronization.
3. Handle the authorization code independently of the asset message. Send it
   immediately to authenticated `POST /api/meta/connect/embedded/exchange`
   with the selected `setupType` and `solutionId`. Meta's code lifetime is 30 seconds; do not
   wait for the asset message before exchanging it.
4. The server exchanges the code without an SDK `redirect_uri` and returns a
   ten-minute opaque AES-GCM ticket. The ticket binds the business token to
   the signed-in user, app, configuration, signup state, selected mode, and
   onboarding lifecycle and partner solution. The raw business token is not returned to the browser.
5. Accept only HTTPS Facebook-origin session messages. Cloud API mode expects
   `FINISH` with WABA and phone IDs. Coexistence expects
   `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`, with WABA and an optional phone
   ID. Mismatched flows, malformed IDs, cancellation, errors, and timeouts
   leave a recoverable error instead of advancing the wizard.
6. Submit the ticket and assets to `POST /api/meta/connect/embedded`. The
   server verifies the ticket/mode, ownership, and WABA/phone relationship.
   For coexistence it requires `is_on_biz_app: true` and
   `platform_type: 'CLOUD_API'`; absent phone IDs are resolved only when an
   unambiguous matching number is available.
7. For partner connections, verify `/{wabaId}/solutions`, app-level webhook
   fields, durable queue storage, and the current Meta phone identity. Reconcile
   an existing Gupshup app using full phone/WABA matches or durably claim one SDK
   creation request with `force:false`. Interrupted or ambiguous creation is
   never replayed; later activation checks only reconcile the existing app.
   Confirm the live OneDirect app's WABA health, authenticated v3 callback,
   and Connektly's management webhook subscription before showing connected.
   A provider refusal or HTML response leaves the channel pending.
   Coexistence then uses Gupshup's `/coex/sync` API with the same durable claims
   as direct Meta sync. No second import is issued through the other provider.
8. Cloud API mode offers optional profile editing. Coexistence proceeds to
   the billing step with synchronization status; it does not expose API
   profile editing. Partner connections show partner billing. Direct connections
   still prompt for their own Meta payment method. Connected does not certify
   wallet balance or remove Meta messaging limits.

`POST /api/meta/channel/partner/activate` powers **Check partner setup**. It
rechecks readiness without blindly repeating app creation or imports. Only
Gupshup handles outbound partner messages, marketing templates, read receipts,
user blocking, and ordinary media uploads/downloads. Provider failures never
fall back to direct Meta sending. Graph template and phone-asset management
retain Connektly's management token. Gupshup's `gs_id` is reconciled with the
Meta `wamid` for delivery receipts and contextual replies. Duplicate callbacks
share the existing message/import deduplication; statuses arriving before local
send persistence receive bounded delayed reconciliation.

Partner solution lifecycle events require Meta's HMAC signature. MPS
`account_update` events route using `value.waba_info.waba_id`, since `entry.id`
can identify the provider portfolio. Solution updates are timestamp ordered;
deactivation pauses sending and reactivation requires a fresh readiness check.
Gupshup callbacks cannot change global solution lifecycle state.

The active solution grants calling to OneDirect. Gupshup currently documents
partner calling in `GS_SIP` mode; Connektly's existing browser WebRTC calling
cannot use its own Meta token for these customers. Both UI and API disable that
path and explain the SIP requirement. Coexistence calls remain in the Business
app. SIP trunk configuration and a browser-to-SIP bridge are not implemented.

Primary partner references: [SDK app creation](https://bizgate-docs.gupshup.io/reference/createtppapp),
[v3 messaging](https://partner-docs.gupshup.io/docs/whatsapp-passthrough-apis-for-partners),
[callback subscriptions](https://partner-docs.gupshup.io/reference/setsubscription-api-v3),
[coexistence sync](https://partner-docs.gupshup.io/reference/initiatecoexsync), and
[Meta Multi-Partner Solutions](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/multi-partner-solutions).

Manual credentials remain available for Cloud API only. Existing Business app
numbers must use the coexistence Embedded Signup path.

## Synchronization and Inbox behavior

Both initial synchronization operations must start within **24 hours** of the
persisted onboarding time. Each can be requested only once per actual onboarding
lifecycle. Ordinary retries, a new authorization ticket, process restarts, or an
ambiguous network response do not reset that evidence.

| Stored operation status | Meaning |
| --- | --- |
| `not_requested` | No claim/evidence exists; a safe activation check may start this operation within its window |
| `requested` | The durable claim was committed; the Meta call may still be in flight or its outcome may be interrupted |
| `pending` | Meta accepted the request; save its `requestId` for support and wait for webhook data |
| `completed` | Confirmed by synchronization webhook state; history progress is 100 |
| `declined` | The business declined history sharing, reported by Meta error `2593109`; live supported messaging can continue |
| `unknown`, `failed`, `expired` | Needs attention; do not repeat the once-only Meta request |

An accepted request is **not** a completed import. History progress and completion
come from webhooks. Contact payloads do not provide a reliable initial-import
completion marker, so receiving a contact batch does not mark all contacts as
imported. The Channels page shows these states and support request IDs.

Signed coexistence webhook changes are committed to the queue before Meta is
acknowledged, then processed asynchronously. Imports and app echoes merge by
WhatsApp message ID so webhook retries and media arriving after a placeholder do
not create another copy. Large history batches, out-of-order history/media,
contact changes, app-sent echoes, and supported edit/revoke events are handled.

Only individual chats are imported, for up to 180 days when shared. Media asset
details can arrive separately for messages within the recent 14-day media
window; older history can retain a media placeholder. Group chats and app-only
business tools are not mirrored. Inbox labels imported history and Business app
messages, and applies edit/revoke changes to their original messages.

Imported history and Business app activity do **not** open or extend the Cloud
API customer service window. Connektly's Cloud API replies require a new inbound
customer message after onboarding to open the normal 24-hour window, or an
approved template outside it. API traffic remains subject to Meta pricing;
messages sent directly from the Business app remain governed by its app rules.

Coexistence has fixed throughput of **20 messages per second**. The API uses
shared database sending slots for the phone so separate API instances cannot
each exceed that allowance independently.

## Controls, offboarding, and recovery

For coexistence connections, Connektly directs profile/name/photo/PIN/phone
verification and voice/video calling controls to the WhatsApp Business app.
Phone-level catalog/cart settings are also managed there. Separate Meta catalog
and product management does not synchronize the Business app's catalog, orders,
status, labels, quick replies, or other app-only tools. The API rejects
unsupported number-management and calling endpoints as well as hiding their
controls in the frontend.

`POST /api/meta/channel/coexistence/activate` rechecks saved prerequisites and
starts only previously unrequested synchronization steps. The UI calls this
**Check connection status**. It cannot safely repair an import whose outcome is
unknown by sending that import request again. Check the saved request ID with
Meta support before deciding to reconnect.

To offboard, the customer opens **WhatsApp Business app > Settings > Account >
Business Platform > Disconnect Account**. The Cloud API Deregister endpoint and
Connektly's ordinary disconnect/webhook-unsubscribe controls must not be used for
coexistence. A `PARTNER_REMOVED` webhook records the disconnection and its reason.
A new initial import then requires a fresh coexistence Embedded Signup lifecycle.
Reauthorizing an active number preserves its original once-only synchronization
state. A ticket from a disconnected lifecycle cannot replay its imports.

**Device reconnection is a different lifecycle.** Changing devices, reinstalling,
or re-registering the Business app can produce `ACCOUNT_OFFBOARDED`. Cloud API
sending pauses, but the token, WABA, subscriptions, and import evidence remain.
After the customer registers the Business app again and keeps the previous Cloud
API products selected in Meta's registration flow, Meta reconnects the same WABA
automatically; `ACCOUNT_RECONNECTED` resumes the connection. This can take a few
minutes. This reconnection does not trigger another history import and does not
require a new partner signup. Supported companion devices must be linked again
manually. A customer-initiated Business Platform disconnection with
`PARTNER_REMOVED` requires the separate fresh-signup path above.

See Meta's [Business app onboarding documentation](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users)
and [reconnecting offboarded coexistence clients](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/reconnect-offboarded-coexistence-clients/).
Also consult [Embedded Signup implementation](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation)
and [account update webhook events](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/account_update).

## Verification

Run `npm run lint`, `npm test`, and `npm run build`. Focused suites are available
with `npm run test:embedded-signup` and `npm run test:coexistence`. They simulate
SDK callback order, WABA-only coexistence completion, ticket/mode validation,
safe once-only synchronization, webhook merging/lifecycle events, capability
restrictions, shared sending limits, and rendered UI for both connection modes.

A live HTTPS acceptance test must still verify a real eligible Business app
number, webhook delivery, contact import, shared-history completion or refusal,
new app-sent echoes, inbound customer replies and templates, the applicable billing
setup, and offboarding/reconnection. Check supported companion devices after
onboarding because Meta unlinks existing companions; WhatsApp for Windows and
WearOS are not supported companions for this integration. Unit/simulated tests
do not establish live Meta authorization or delivery.

On October 17, 2026, Meta showed solution 1287084176407435 Active and Gupshup
Settings > Solutions showed APPROVED. Meta confirmed all six required webhook
fields above are active. The regenerated UT authenticated both documented app
list endpoints; the linked-app inventory contained 41 apps. Neither saved
pending signup matched that inventory by exact normalized phone or its
deterministic app name. Both customer SDK creation attempts returned a non-JSON
HTTP 200 and remain `creation.status: unknown`.

A validation-only SDK POST with an empty JSON body, with no customer assets or
creation fields supplied, also returned HTTP 200 `text/html` titled
`WhatsApp Partner Portal - Gupshup.io`, including after the credential rotation.
The documented missing-field response is HTTP 400 JSON. Gupshup must confirm the
production SDK route and this partner's Bizgate/TPP availability; account
enablement is not established merely by an approved Meta solution or a passing
legacy app-list call. Confirm the result of the saved attempts before releasing
any unknown creation claim. Reconcile an existing app rather than creating
another one. Run a real HTTPS customer acceptance test after this is resolved;
unit tests and app-list authentication do not prove live provisioning.
References: [SDK create](https://bizgate-docs.gupshup.io/reference/createtppapp)
and [Bizgate prerequisites](https://bizgate-docs.gupshup.io/reference/getting-started).
