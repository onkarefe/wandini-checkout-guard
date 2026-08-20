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
   **NODE_ENV=production**, and **PORT** on the host. No real secret belongs in
   this repository.
3. Run **npm run setup** during release and **npm run start** after
   **npm run build**.
4. Provide persistent storage for **prisma/dev.sqlite** and run one app
   instance, or migrate Prisma to a production database before horizontal
   scaling.

## Manual Shopify work still pending

After hosting is ready, manually sync/deploy the app configuration and Function,
choose the intended Shopify distribution method, install the app, create and
activate the Validation, and set the real app-owned Validation metafield
**checkout_hmac_secret** plus the matching signer secret. None of those actions
are performed by local builds.
