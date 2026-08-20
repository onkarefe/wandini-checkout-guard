# Wandini checkout authorization guard — proof v1

## Purpose

Configured Wandini wallpaper must not be purchasable through a direct/native
Shopify checkout at the catalog per-square-metre variant price. Pricing remains
the responsibility of the Wandini server and Draft Order flow. This Function is
the final Shopify-side enforcement layer: at checkout it verifies that every
trusted configured product line carries an authentic, price-bound authorization.

The Function never calculates area pricing and never trusts line attributes to
classify merchandise.

## Trusted classification

Classification uses only Shopify product and variant metafields:

- Product: namespace `custom`, key `master_asset_id`
- ProductVariant: namespace `custom`, key `print_quality`

The product `master_asset_id` signal is valid when its trusted Shopify
metafield value is non-empty, has no leading or trailing whitespace, and contains
no ASCII control character. Its metafield type is intentionally not constrained
because the production contract establishes the value, not one specific type,
as the authoritative signal.

The variant `print_quality` signal is valid only when its metafield type is
`metaobject_reference` and its value is a Shopify Metaobject GID in the exact
form `gid://shopify/Metaobject/<positive decimal ID>`. A text value such as
`premium` is not a valid print-quality signal.

| Product master asset | Variant print quality | Classification | Checkout result |
| --- | --- | --- | --- |
| absent | absent | ordinary | Wandini proof not required |
| valid | valid | configured | valid proof required |
| any other combination | any other combination | invalid/partial | fail closed |

Customer-controlled `configurator_payload`,
`configurator_instance_id`, and `_wandini_checkout_proof` attributes do not
affect classification. `price_per_m2` and `price_wo_disc` are neither queried
nor used.

Non-ProductVariant merchandise has no applicable product/variant marker pair and
is left unaffected.

## Buyer journey enforcement

The guard returns no errors at `CART_INTERACTION`. This permits the existing
Hydrogen configured-cart flow to add and update lines before Checkpoint 4B adds
proofs.

The guard enforces all classification and authorization checks at both:

- `CHECKOUT_INTERACTION`
- `CHECKOUT_COMPLETION`

This covers the checkout stages exposed by the generated validation Function
schema, including Shopify-supported express checkout paths that invoke checkout
validation.

## Proof-v1 field format

One line attribute is used:

`_wandini_checkout_proof`

Its exact eight-field format is:

```text
v1.<variant_b64url>.<instance_b64url>.<payload_sha256_b64url>.1.<unit_minor>.<currency>.<signature_b64url>
```

Every base64url field uses the RFC 4648 URL-safe alphabet, has no padding, and is
canonical. Hash and signature fields encode exactly 32 bytes and are therefore
exactly 43 characters.

Fields, in order:

1. Literal version `v1`.
2. Unpadded base64url of the UTF-8 bytes of the exact Shopify ProductVariant GID.
3. Unpadded base64url of the UTF-8 bytes of the exact
   `configurator_instance_id`.
4. Unpadded base64url of SHA-256 of the UTF-8 bytes of the exact
   `configurator_payload` line-attribute string. The string is not parsed,
   normalized, trimmed, or reserialized.
5. Literal quantity `1`.
6. Expected unit amount in canonical EUR minor-unit decimal digits, with no sign
   and no leading zero unless the value is exactly `0`.
7. Three-letter uppercase currency code. Version 1 is restricted to `EUR`.
8. Unpadded base64url HMAC-SHA256 signature.

The instance ID is treated as an opaque UTF-8 identifier. It must be 1–128 UTF-8
bytes and contain no ASCII control character.

## Canonical signing representation

The signed bytes are the UTF-8 encoding of the first seven proof fields joined
by one ASCII period, with no leading/trailing period, whitespace, newline, or
padding:

```text
v1.<variant_b64url>.<instance_b64url>.<payload_sha256_b64url>.1.<unit_minor>.<currency>
```

This is a fixed-field contract, not JSON serialization. The signature is:

```text
base64url_no_padding(HMAC-SHA256(UTF8(secret), UTF8(canonical_string)))
```

The verifier compares the 43-character signature in constant time after strict
shape validation.

## Exact EUR money handling

`cart.lines[].cost.amountPerQuantity.amount` is parsed as a decimal string.
No `Number`, `parseFloat`, or floating-point arithmetic is used.

- An unsigned whole-number part is required.
- Zero or more fractional digits are accepted.
- The first two fractional digits are EUR cents and are right-padded with zero.
- Fractional digits after the second are allowed only when all are zero.
- Negative values, a plus sign, exponent notation, commas, missing whole parts,
  and non-zero precision beyond cents are rejected.
- The normalized minor-unit digit string is compared exactly with the signed
  field.

Thus `144.45` and Shopify's harmless `144.450` both normalize to `14445`;
`144.451` is rejected.

## Validation-owner secret

The input query reads:

```graphql
validation {
  hmacSecret: metafield(key: "checkout_hmac_secret") {
    type
    value
  }
}
```

Omitting `namespace` selects the owning app's reserved namespace according to
the generated Function schema. The later manual configuration must therefore be
an app-owned Validation-owner metafield with:

- Logical reserved namespace: `$app` (the Function input uses the implicit
  app-reserved namespace)
- Key: `checkout_hmac_secret`
- Type: `single_line_text_field`
- Value: the same secret used by the Checkpoint 4B signer
- Verifier constraint: 32–128 printable ASCII non-whitespace characters

There is no production secret in this repository. The documented fixture secret
exists only in local tests. A configured line fails closed if the owner
metafield is absent, has the wrong type, or contains an invalid secret. Ordinary
lines remain unaffected.

## No expiry and replay limitation

Proof v1 intentionally has no expiry. The generated deterministic Function input
provides no trusted high-precision runtime timestamp suitable for checking a
per-proof expiry. Browser time, `Date.now()`, cart attributes, and unsigned
timestamps are not security clocks and are not used.

The proof is bound to the exact variant, instance ID, payload bytes, quantity,
unit minor amount, and currency. An otherwise identical proof can be replayed
for those identical claims. Version 1 does not claim stronger replay prevention.
Secret rotation invalidates previously issued proofs.

## Fixed interoperability vector

This vector was independently generated with Node's standard HMAC-SHA256 for
cross-checking; the Function runtime implementation uses `@noble/hashes`.

```text
secret:
wandini-checkpoint-4a-fixture-secret-2026

variant:
gid://shopify/ProductVariant/9876543210

configurator_instance_id:
550e8400-e29b-41d4-a716-446655440000

exact configurator_payload:
{"width_cm":250,"height_cm":240,"crop":"center"}

quantity:
1

expected unit minor:
14445

currency:
EUR

payload SHA-256 (unpadded base64url):
BTb2bqaIFs9d2ccyhaUL6uHMgLNc_cbfRp5YLT-XKtA

canonical string:
v1.Z2lkOi8vc2hvcGlmeS9Qcm9kdWN0VmFyaWFudC85ODc2NTQzMjEw.NTUwZTg0MDAtZTI5Yi00MWQ0LWE3MTYtNDQ2NjU1NDQwMDAw.BTb2bqaIFs9d2ccyhaUL6uHMgLNc_cbfRp5YLT-XKtA.1.14445.EUR

HMAC-SHA256 (unpadded base64url):
kJItHGdvBL01EhxN-lTX7phPxF_2QGRKrRE6kzLsu18

complete proof:
v1.Z2lkOi8vc2hvcGlmeS9Qcm9kdWN0VmFyaWFudC85ODc2NTQzMjEw.NTUwZTg0MDAtZTI5Yi00MWQ0LWE3MTYtNDQ2NjU1NDQwMDAw.BTb2bqaIFs9d2ccyhaUL6uHMgLNc_cbfRp5YLT-XKtA.1.14445.EUR.kJItHGdvBL01EhxN-lTX7phPxF_2QGRKrRE6kzLsu18
```

Checkpoint 4B must reuse this vector unchanged.

## Fail-closed behavior

At a checkout stage, an invalid/partial trusted classification always blocks. A
configured line blocks on any missing or malformed attribute, quantity other
than one, claim mismatch, price/currency mismatch, missing secret, malformed
proof, unsupported version, or invalid HMAC.

The guard also independently requires every configured line in the checkout to
have a unique `configurator_instance_id`. Reusing the same instance ID on two
configured lines blocks the checkout even when both proofs are otherwise valid.
Ordinary lines do not participate in this uniqueness set.

The customer receives only:

> This customized item could not be validated. Please return to your cart and
> try again.

The error targets `$.cart` so no security-specific failure detail is exposed.

## Read-only dependency audit

On 2026-08-20, `npm audit --json`, `npm audit --omit=dev --json`, and
`pnpm audit --json` were run without any fix command. npm reports 13 high
entries because it propagates one vulnerable transitive package through its
GraphQL-codegen and Shopify Function dependency chain. pnpm reports the two
underlying advisories directly.

| npm-reported package | Installed version(s) | Actual role |
| --- | --- | --- |
| `@graphql-codegen/add` | 5.0.3 | build/type-generation tooling |
| `@graphql-codegen/cli` | 5.0.5, 5.0.6 | build/type-generation tooling |
| `@graphql-codegen/client-preset` | 4.8.3 | build/type-generation tooling |
| `@graphql-codegen/core` | 4.0.2 | build/type-generation tooling |
| `@graphql-codegen/gql-tag-operations` | 4.0.17 | build/type-generation tooling |
| `@graphql-codegen/plugin-helpers` | 5.1.1 | build/type-generation tooling; imports vulnerable lodash |
| `@graphql-codegen/schema-ast` | 4.1.0 | build/type-generation tooling |
| `@graphql-codegen/typed-document-node` | 5.1.2 | build/type-generation tooling |
| `@graphql-codegen/typescript` | 4.1.6 | build/type-generation tooling |
| `@graphql-codegen/typescript-operations` | 4.6.0, 4.6.1 | build/type-generation tooling |
| `@graphql-codegen/visitor-plugin-common` | 5.8.0 | build/type-generation tooling |
| `@shopify/shopify_function` | 2.0.1 | Shopify build/runtime adapter package; audit status is inherited from its codegen dependencies |
| `lodash` | 4.17.23 | actual vulnerable transitive package, used by GraphQL-codegen tooling |

The underlying lodash advisories are:

- High: `GHSA-r5fr-rjxr-66jc`, code injection through attacker-controlled
  `_.template` import key names.
- Moderate: `GHSA-f23m-r3pf-42rh`, prototype pollution through array-path
  bypasses in `_.unset` and `_.omit`.

npm's production-only view still reports the chain because
`@shopify/shopify_function` declares its code generators as package
dependencies. Bundle inspection provides the relevant runtime distinction:

- `dist/function.js` and `dist/function.wasm` contain no `lodash` or
  `@graphql-codegen` code.
- Only the small `@shopify/shopify_function/run.ts` Shopify input/output
  adapter is bundled from that package.
- `@noble/hashes` 1.8.0 is bundled, is not present in either audit report, and
  is not implicated by these advisories.

The advisories therefore present a build-host risk only if untrusted
schema/query/codegen configuration is processed in a build environment. This
checkpoint uses checked-in local schema, query, and configuration. They do not
create a realistic Shopify Function checkout-runtime risk. No dependency was
upgraded and no audit fix was run.

## Shopify-side actions still pending

None of these actions were executed in Checkpoint 4A:

1. Review and approve this proof contract.
2. Deploy/release the app and Function.
3. Configure app distribution and install the app on the intended store.
4. Create or enable the cart/checkout validation that owns this Function.
5. Generate a production-strength shared secret outside source control.
6. Set the app-owned `$app.checkout_hmac_secret` metafield on that Validation
   owner.
7. Configure the same secret in the Checkpoint 4B Wandini server signer.
8. Confirm the intended products and variants have well-formed trusted
   `custom.master_asset_id` and `custom.print_quality` metafields.
9. Activate the validation.
10. Perform controlled store checkout, completion, express checkout, secret
    rotation, and native-bypass acceptance testing.

No Admin API mutation, metafield write, installation, activation, deployment, or
production operation occurred in this checkpoint.
