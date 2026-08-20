# Wandini Checkout Guard

Wandini Checkout Guard is a minimal developer-hosted Shopify app with one
Shopify-hosted Cart & Checkout Validation Function.

## Architecture

- The React Router web process provides Shopify authentication, installation,
  embedded App Home, lifecycle/compliance webhooks, and persistent sessions.
- Prisma with SQLite is the official scaffold's minimum session store.
- **extensions/wandini-checkout-validation** is the only deployable Function. It
  runs on Shopify infrastructure and does not call the web process at checkout.
- The app requests only **read_products**. App Home makes no Admin API calls.

The proof-v1 contract and validation behavior are documented in
**extensions/wandini-checkout-validation/docs/checkout-proof-v1.md**.

## Local development and verification

~~~shell
npm install
npm run setup
npm run dev
~~~

The dev command uses Shopify CLI and can update the development app URLs. It
requires an authenticated Shopify CLI session and is intentionally not run by
this checkpoint.

~~~shell
npm run typegen
npm test
npm --workspace wandini-checkout-validation run build
npm run typecheck
npm run build
npm run build:shopify
~~~

## Hosting configuration still required

Before production hosting:

1. Replace **https://example.invalid** in **shopify.app.toml** with the real
   HTTPS host, keeping **/app** as the application path and
   **/auth/callback** as the redirect path.
2. Set **SHOPIFY_API_KEY**, **SHOPIFY_API_SECRET**, **SHOPIFY_APP_URL**,
   **NODE_ENV=production**, and **PORT** on the host. **SHOPIFY_APP_URL** must be
   the public HTTPS origin without the **/app** path. These are the only runtime
   environment variables used by this app shell; **SCOPES** and
   **DATABASE_URL** are not read. No real secret belongs in this repository.
3. Use a supported Node.js version from **package.json**. Install dependencies,
   run **npm run setup**, run **npm run build**, then start the web process with
   **npm run start**. The build produces **build/server/index.js** and the
   matching static client assets under **build/client**.
4. Mount persistent, writable storage at **prisma/** so
   **prisma/dev.sqlite** survives releases and restarts. Run exactly one app
   instance against this SQLite file. The current schema has a fixed SQLite URL,
   so setting **DATABASE_URL** does not relocate it. Migrating to a shared
   database is required before horizontal scaling.
5. Expose the configured **PORT** through a public HTTPS endpoint. TLS may
   terminate at the hosting platform's reverse proxy; the Node process can
   receive proxied HTTP. Preserve the public host header and set
   **SHOPIFY_APP_URL** to the externally visible HTTPS origin.

## Manual Shopify work still pending

After hosting is ready, manually sync/deploy the app configuration and Function,
choose the intended Shopify distribution method, install the app, create and
activate the Validation, and set the real app-owned Validation metafield
**checkout_hmac_secret** plus the matching signer secret. None of those actions
are performed by local builds.
