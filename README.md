# Wandini Checkout Guard

Wandini Checkout Guard is a production-minimal Shopify extension-only app. It
contains one Cart & Checkout Validation Function that prevents trusted configured
wallpaper variants from proceeding through native checkout unless their exact
variant, configuration payload, instance, quantity, unit price, and currency are
authorized by a valid Wandini HMAC proof.

The only deployable extension is:

`extensions/wandini-checkout-validation`

The complete proof-v1 protocol, trusted merchandise classification, validation
owner metafield contract, audit notes, and security limitations are documented
in
[checkout-proof-v1.md](extensions/wandini-checkout-validation/docs/checkout-proof-v1.md).

## Local verification

Install dependencies from the repository root when required:

```shell
npm install
```

Run Function checks from `extensions/wandini-checkout-validation`:

```shell
npm run typegen
npm test -- --run
npm run build
```

Run the complete local app build from the repository root:

```shell
npm run build
```

These commands generate types, execute unit and compiled-Wasm fixtures, and
compile the JavaScript Function through Javy into
`extensions/wandini-checkout-validation/dist/function.wasm`.

## Secrets and Shopify activation

No production HMAC secret belongs in this repository. Test secrets are fixtures
only. The real secret must later be configured manually on the Shopify
Validation owner in the app-reserved metafield described by the proof-v1
contract, and separately in the authorized Wandini signer.

Deployment, app installation, validation creation, secret configuration, and
validation activation are manual Shopify-side steps. None are performed by the
local commands above.
