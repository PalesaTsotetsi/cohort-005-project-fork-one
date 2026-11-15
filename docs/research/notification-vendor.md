# Which hosted notification vendor fits Cadence?

Research for [issue #8](https://github.com/PalesaTsotetsi/cohort-005-project-fork-one/issues/8) (map: #6). All sources checked **2026-11-15**. Primary sources only (vendor pricing pages, docs, first-party SDK READMEs).

Constraints: hosted only; v1 is an in-app feed with our own UI (headless); email maybe later; recipients are Student, Instructor, Platform Admin, Team Admin; the DevUI user switcher means the server must mint a signed token for whichever user is selected.

## Recommendation

**Knock**, with **Courier** as the fallback.

- Knock's Free plan includes everything v1 needs: preferences, unlimited in-app feeds and the Feed API, 10,000 messages/month ([pricing](https://knock.app/pricing)).
- Its headless `@knocklabs/client` has feed state, a managed websocket, mark read/seen/archived, and get/set preferences ([README](https://github.com/knocklabs/javascript/blob/main/packages/client/README.md)).
- Per-user tokens are RS256 JWTs. You sign them server-side with `signUserToken` from `@knocklabs/node`, and `sub` is the user id ([security docs](https://docs.knock.app/in-app-ui/security-and-authentication)). That matches the DevUI switcher: mint a token in a loader for the selected user.
- Preferences are category × channel-type, with an environment-wide default set ([preferences](https://docs.knock.app/preferences/overview)).

**Fallback: Courier.** Its free tier is the same size (10,000 sends). JWT auth is the only path for its SDKs, and its headless `@trycourier/courier-js` covers inbox, websocket and preferences. Its topic defaults support `OPTED_OUT` directly. The cliff is gentler too: pay-as-you-go at $0.005 per send, with no $250 minimum. The downsides are a coarser preference model (topic + custom routing, see below) and the fact that the free → paid switch bills *every* send, including the first 10,000 ([pricing](https://www.courier.com/pricing)).

## Comparison

| | Knock | Courier | Novu Cloud | SuprSend | MagicBell |
|---|---|---|---|---|---|
| Free tier | 10k messages/mo, no hard cap ([1](https://knock.app/pricing)) | 10k sends/mo ([2](https://www.courier.com/pricing)) | 10k workflow runs/mo, 5 workflows, 24h activity retention ([3](https://novu.co/pricing)) | 10k notifications/mo, branded feed ([4](https://www.suprsend.com/pricing)) | 1k deliveries/mo ([5](https://www.magicbell.com/pricing)) |
| Per-user auth | RS256 JWT, optional "enhanced security mode" per env ([6](https://docs.knock.app/in-app-ui/security-and-authentication)) | JWT from `POST /auth/issue-token`, the only SDK path ([7](https://www.courier.com/docs/platform/inbox/authentication)) | HMAC-SHA256 `subscriberHash`, optional toggle ([8](https://docs.novu.co/platform/inbox/prepare-for-production)) | Signed JWT, optional "enhanced security mode" ([9](https://docs.suprsend.com/docs/client-authentication)) | User JWT from secret + API key ([10](https://www.magicbell.com/docs/api/authentication)) |
| Headless JS + realtime | `@knocklabs/client`, websocket ([11](https://github.com/knocklabs/javascript/blob/main/packages/client/README.md)) | `@trycourier/courier-js`, websocket ([12](https://www.courier.com/docs/sdk-libraries/courier-js-web)) | `@novu/js`, websocket ([13](https://docs.novu.co/platform/sdks/javascript)) | Web SDK `identify(id, token)` ([9](https://docs.suprsend.com/docs/client-authentication)) | Not verified |
| Preferences | categories × channel_types, env default set; on Free ([1](https://knock.app/pricing), [14](https://docs.knock.app/preferences/overview)) | topics with `OPTED_IN`/`OPTED_OUT`/`REQUIRED` defaults + per-topic channel routing ([15](https://www.courier.com/docs/platform/preferences/preferences-overview)) | per-workflow × channel + global; workflow defaults can be off; no categories ([16](https://docs.novu.co/platform/concepts/preferences)) | **Business plan only ($250/mo)** ([4](https://www.suprsend.com/pricing)) | Not verified |
| Email later | Yes, multi-channel workflows | Yes | Yes | Yes | Yes |
| First paid step | Starter $250/mo incl. 50k, then $0.005/msg ([1](https://knock.app/pricing)) | Business $0.005 per send, all sends billed ([2](https://www.courier.com/pricing)) | Pro from $30/mo incl. 30k, $1.20/1k ([3](https://novu.co/pricing)) | Essentials $100/mo (no prefs); Business $250/mo ([4](https://www.suprsend.com/pricing)) | Startup $249/mo incl. 50k ([5](https://www.magicbell.com/pricing)) |

**Dropped:** MagicBell, because its free tier is 1,000 deliveries/month, which is thin for dev and seeding. SuprSend, because per-user preferences need the $250/mo Business plan.

## Detail per vendor

### Knock
- **Free tier:** $0, up to 10,000 messages/month. Preferences and "unlimited in-app feeds and Feed API" are on all plans. There is no hard cap: Knock contacts you to set up billing. Log retention is 30 days. Per-tenant preferences, i18n and custom roles are Enterprise-only. ([pricing](https://knock.app/pricing))
- **Security:** "Enhanced security mode is off by default". It is enabled per environment and recommended for production. Once it is on, "Knock will reject requests from the client using your public API key that do not include a signed user token." Tokens are RS256, signed with `KNOCK_SIGNING_KEY`, with `sub` required and `exp` recommended. `signUserToken` defaults to 3600s. ([docs](https://docs.knock.app/in-app-ui/security-and-authentication)) **Caveat:** the mode is optional, so we must turn it on in every environment, development included, to exercise the DevUI token path.
- **Headless client:** `knockClient.authenticate(userId, token)`, `feeds.initialize(channelId)`, `listenForUpdates()`, the `items.received.realtime` event, `fetch({status})`, `markAsRead/Seen/Archived`, `user.getPreferences/setPreferences`. ([README](https://github.com/knocklabs/javascript/blob/main/packages/client/README.md))
- **Preferences:** A `PreferenceSet` has `categories`, `channel_types`, `channels` and `workflows`, and channel types can nest under a category (a category × channel grid). Unset values default to `true`. An environment default set can differ "from Knock's default of opting all recipients in". A category set to `false` blocks a notification even if a channel is `true`. ([overview](https://docs.knock.app/preferences/overview)) **Caveat:** the docs show the default set as a normal `PreferenceSet`, but I found no explicit example of a category defaulting to `false`. Verify that during the prototype.
- **Pricing cliff:** Free → Starter is $250/mo flat (50k messages included), then $0.005 per message. ([pricing](https://knock.app/pricing))

### Courier
- **Free tier:** Developer plan, 10,000 sends/month. One send is one template to one recipient, however many channels it uses, and test environment sends count. Past 10k you add a card and move to Business at $0.005 per send for *every* send (50k = $250/mo). ([pricing](https://www.courier.com/pricing)) The pricing page doesn't say whether Inbox or preferences are plan-gated.
- **Security:** The backend mints a JWT through `POST /auth/issue-token` with scopes `user_id:<id> inbox:read:messages inbox:write:events`. Always set `expires_in`, because omitting it "mints a token that never expires". The SDKs don't refresh tokens. ([docs](https://www.courier.com/docs/platform/inbox/authentication)) This is mandatory by design, which is a plus.
- **Headless client:** `@trycourier/courier-js` provides `inbox.getMessages()`, `inbox.socket.connect()`, read/archive/readAll, unread counts (refetched on socket events), and `preferences.getUserPreferences/putUserPreferenceTopic`. ([docs](https://www.courier.com/docs/sdk-libraries/courier-js-web))
- **Preferences:** Each subscription topic defaults to `OPTED_IN`, `OPTED_OUT` or `REQUIRED`, so defaulting a category to "off" is first-class. A per-topic channel choice (`custom_routing`) works only when the topic has channel selection enabled. ([overview](https://www.courier.com/docs/platform/preferences/preferences-overview))

### Novu Cloud
- **Free tier:** 10k workflow runs/month, **5 workflows**, 2 environments, 24h activity feed retention. Pro starts at $30/mo with 30k runs and $1.20/1k overage, which is the cheapest cliff. ([pricing](https://novu.co/pricing))
- **Security:** HMAC-SHA256 of the subscriberId with the secret key, sent as `subscriberHash`. The toggle is optional, but when it is on, "the Inbox will not load" without the hash. ([docs](https://docs.novu.co/platform/inbox/prepare-for-production))
- **Headless client:** `@novu/js` provides `notifications.list/read/archive`, `preferences.list/update/bulkUpdate`, and `on('notifications.notification_received')` over a websocket. ([docs](https://docs.novu.co/platform/sdks/javascript))
- **Preferences:** These are per *workflow* × channel plus global, and workflow defaults can be disabled. Category isn't a concept in Novu, and with 5 workflows on Free you can't model many notification types. ([preferences](https://docs.novu.co/platform/concepts/preferences))

### SuprSend
- Free tier: 10k notifications/mo, with a SuprSend-branded inbox. User preferences are listed under Business ($250/mo), and the overage there is $5/1k. ([pricing](https://www.suprsend.com/pricing)) Auth is a signed JWT under an optional "enhanced security mode" ([client auth](https://docs.suprsend.com/docs/client-authentication)).

### MagicBell
- Builder (free) tier: 1,000 deliveries/mo. Startup is $249/mo for 50k, with $0.0025 overage ([pricing](https://www.magicbell.com/pricing)). The inbox uses user JWTs generated on the backend from the secret key and API key ([auth](https://www.magicbell.com/docs/api/authentication)).

## Caveats / open questions for the prototype
1. Knock: confirm an environment default `PreferenceSet` can set a category (for example, marketing for Instructors) to `false`.
2. Knock: turn on enhanced security mode in the development environment too, so the DevUI → `signUserToken(selectedUser.id)` path is tested from day one.
3. Knock's jump from Free to Starter is $250/mo. If cost sensitivity bites, Courier (pay-as-you-go) or Novu Pro ($30) are cheaper first steps.
4. Feature-gating details that pricing pages render poorly (Courier inbox/preferences plan gating) were not fully confirmed.
