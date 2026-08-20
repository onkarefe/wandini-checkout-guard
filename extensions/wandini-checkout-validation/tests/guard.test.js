import { describe, expect, test } from 'vitest';
import { cartValidationsGenerateRun } from '../src/cart_validations_generate_run';
import {
  buildCanonicalClaims,
  hmacSha256Base64Url,
  parseEurMinorUnits,
  sha256Base64Url,
  verifyProofV1,
} from '../src/proof';

const SECRET = 'wandini-checkpoint-4a-fixture-secret-2026';
const ATTACKER_SECRET = 'attacker-controlled-fixture-secret-000000';
const VARIANT_ID = 'gid://shopify/ProductVariant/9876543210';
const INSTANCE_ID = '550e8400-e29b-41d4-a716-446655440000';
const PAYLOAD = '{"width_cm":250,"height_cm":240,"crop":"center"}';
const MESSAGE =
  'This customized item could not be validated. Please return to your cart and try again.';

const FIXED_PAYLOAD_SHA256 = 'BTb2bqaIFs9d2ccyhaUL6uHMgLNc_cbfRp5YLT-XKtA';
const FIXED_CANONICAL =
  'v1.Z2lkOi8vc2hvcGlmeS9Qcm9kdWN0VmFyaWFudC85ODc2NTQzMjEw.NTUwZTg0MDAtZTI5Yi00MWQ0LWE3MTYtNDQ2NjU1NDQwMDAw.BTb2bqaIFs9d2ccyhaUL6uHMgLNc_cbfRp5YLT-XKtA.1.14445.EUR';
const FIXED_SIGNATURE = 'kJItHGdvBL01EhxN-lTX7phPxF_2QGRKrRE6kzLsu18';
const FIXED_PROOF = FIXED_CANONICAL + '.' + FIXED_SIGNATURE;

function singleLine(value) {
  return { type: 'single_line_text_field', value };
}

function masterAsset(value = 'master-asset-123', type = 'single_line_text_field') {
  return { type, value };
}

function printQuality(id = '1234567890') {
  return {
    type: 'metaobject_reference',
    value: 'gid://shopify/Metaobject/' + id,
  };
}

function signProof({
  secret = SECRET,
  variantId = VARIANT_ID,
  instanceId = INSTANCE_ID,
  payload = PAYLOAD,
  unitMinor = '14445',
  currency = 'EUR',
  payloadSha256 = sha256Base64Url(payload),
} = {}) {
  const canonical = buildCanonicalClaims({
    variantId,
    instanceId,
    payloadSha256,
    quantity: '1',
    unitMinor,
    currency,
  });
  return canonical + '.' + hmacSha256Base64Url(secret, canonical);
}

function configuredLine(overrides = {}) {
  return {
    quantity: 1,
    configuratorPayload: { value: PAYLOAD },
    configuratorInstanceId: { value: INSTANCE_ID },
    checkoutProof: { value: signProof() },
    cost: {
      amountPerQuantity: {
        amount: '144.45',
        currencyCode: 'EUR',
      },
    },
    merchandise: {
      __typename: 'ProductVariant',
      id: VARIANT_ID,
      printQuality: printQuality(),
      product: {
        masterAssetId: masterAsset(),
      },
    },
    ...overrides,
  };
}

function ordinaryLine(id = 'ordinary') {
  return {
    quantity: 3,
    configuratorPayload: null,
    configuratorInstanceId: null,
    checkoutProof: null,
    cost: {
      amountPerQuantity: {
        amount: '10.00',
        currencyCode: 'EUR',
      },
    },
    merchandise: {
      __typename: 'ProductVariant',
      id: 'gid://shopify/ProductVariant/' + id,
      printQuality: null,
      product: { masterAssetId: null },
    },
  };
}

function run(lines, options = {}) {
  return cartValidationsGenerateRun({
    buyerJourney: { step: options.step ?? 'CHECKOUT_INTERACTION' },
    validation: {
      hmacSecret:
        options.secretMetafield === undefined
          ? singleLine(SECRET)
          : options.secretMetafield,
    },
    cart: { lines },
  });
}

function errors(result) {
  return result.operations[0].validationAdd.errors;
}

function expectPass(result) {
  expect(errors(result)).toEqual([]);
}

function expectBlock(result) {
  expect(errors(result)).toEqual([{ message: MESSAGE, target: '$.cart' }]);
}

describe('checkout-stage behavior', () => {
  test('1. cart interaction does not require a configured proof', () => {
    const line = configuredLine({ checkoutProof: null });
    expectPass(run([line], { step: 'CART_INTERACTION' }));
  });

  test('2. ordinary product without proof passes checkout', () => {
    expectPass(run([ordinaryLine()]));
  });

  test('3. valid configured checkout proof passes', () => {
    expectPass(run([configuredLine()]));
  });

  test('4. multiple ordinary products pass', () => {
    expectPass(run([ordinaryLine('a'), ordinaryLine('b')]));
  });

  test('5. mixed ordinary and valid configured products pass', () => {
    expectPass(run([ordinaryLine(), configuredLine()]));
  });

  test('two valid configured lines with different instance IDs pass', () => {
    const secondInstanceId = '550e8400-e29b-41d4-a716-446655440001';
    const secondLine = configuredLine({
      configuratorInstanceId: { value: secondInstanceId },
      checkoutProof: {
        value: signProof({ instanceId: secondInstanceId }),
      },
    });

    expectPass(run([configuredLine(), secondLine]));
  });

  test('two otherwise-valid configured lines with the same instance ID block', () => {
    expectBlock(run([configuredLine(), configuredLine()]));
  });

  test('configured and ordinary lines may share unrelated line attributes', () => {
    const ordinary = ordinaryLine();
    ordinary.configuratorInstanceId = { value: INSTANCE_ID };
    ordinary.configuratorPayload = { value: PAYLOAD };
    ordinary.checkoutProof = { value: FIXED_PROOF };

    expectPass(run([configuredLine(), ordinary]));
  });

  test.each(['CHECKOUT_INTERACTION', 'CHECKOUT_COMPLETION'])(
    'proof is enforced during %s',
    (step) => {
      expectBlock(run([configuredLine({ checkoutProof: null })], { step }));
    },
  );
});

describe('configured proof failures', () => {
  test('6. missing proof blocks', () => {
    expectBlock(run([configuredLine({ checkoutProof: null })]));
  });

  test('7. malformed proof blocks', () => {
    expectBlock(
      run([configuredLine({ checkoutProof: { value: 'not-a-proof' } })]),
    );
  });

  test('8. unsupported proof version blocks', () => {
    const proof = FIXED_PROOF.replace(/^v1\./, 'v2.');
    expectBlock(run([configuredLine({ checkoutProof: { value: proof } })]));
  });

  test('9. incorrect HMAC blocks', () => {
    const proof = FIXED_PROOF.slice(0, -1) + 'A';
    expectBlock(run([configuredLine({ checkoutProof: { value: proof } })]));
  });

  test('10. proof content modified after signing blocks', () => {
    const proof = FIXED_PROOF.replace('.14445.EUR.', '.14446.EUR.');
    expectBlock(run([configuredLine({ checkoutProof: { value: proof } })]));
  });

  test('11. wrong signed variant ID blocks', () => {
    const proof = signProof({
      variantId: 'gid://shopify/ProductVariant/1111111111',
    });
    expectBlock(run([configuredLine({ checkoutProof: { value: proof } })]));
  });

  test('12. quantity other than exactly one blocks', () => {
    expectBlock(run([configuredLine({ quantity: 2 })]));
  });

  test('13. wrong signed configurator instance ID blocks', () => {
    const proof = signProof({ instanceId: 'another-instance-id' });
    expectBlock(run([configuredLine({ checkoutProof: { value: proof } })]));
  });

  test('14. configurator payload changed after signing blocks', () => {
    expectBlock(
      run([
        configuredLine({
          configuratorPayload: { value: PAYLOAD + ' ' },
        }),
      ]),
    );
  });

  test('15. wrong signed payload hash blocks even with a valid HMAC', () => {
    const proof = signProof({ payloadSha256: 'A'.repeat(43) });
    expectBlock(run([configuredLine({ checkoutProof: { value: proof } })]));
  });

  test('16. wrong exact unit price blocks', () => {
    const line = configuredLine();
    line.cost.amountPerQuantity.amount = '144.46';
    expectBlock(run([line]));
  });

  test('17. wrong currency blocks', () => {
    const line = configuredLine();
    line.cost.amountPerQuantity.currencyCode = 'USD';
    expectBlock(run([line]));
  });

  test('18. missing validation-owner secret blocks configured only', () => {
    expectBlock(run([configuredLine()], { secretMetafield: null }));
    expectPass(run([ordinaryLine()], { secretMetafield: null }));
  });

  test('missing, empty, or malformed configured attributes block', () => {
    expectBlock(run([configuredLine({ configuratorPayload: null })]));
    expectBlock(
      run([configuredLine({ configuratorPayload: { value: '' } })]),
    );
    expectBlock(run([configuredLine({ configuratorInstanceId: null })]));
    expectBlock(
      run([configuredLine({ configuratorInstanceId: { value: 'bad\nvalue' } })]),
    );
  });
});

describe('trusted classification fails closed', () => {
  test('19. master asset without print quality blocks', () => {
    const line = configuredLine();
    line.merchandise.printQuality = null;
    expectBlock(run([line]));
  });

  test('20. print quality without master asset blocks', () => {
    const line = configuredLine();
    line.merchandise.product.masterAssetId = null;
    expectBlock(run([line]));
  });

  test('21. malformed trusted classification metafield blocks', () => {
    const line = configuredLine();
    line.merchandise.printQuality = {
      type: 'single_line_text_field',
      value: 'premium',
    };
    expectBlock(run([line]));

    const malformedReferenceLine = configuredLine();
    malformedReferenceLine.merchandise.printQuality = {
      type: 'metaobject_reference',
      value: 'premium',
    };
    expectBlock(run([malformedReferenceLine]));

    const whitespaceLine = configuredLine();
    whitespaceLine.merchandise.product.masterAssetId = masterAsset('  ');
    expectBlock(run([whitespaceLine]));
  });

  test('master asset classification does not invent a metafield type requirement', () => {
    const line = configuredLine();
    line.merchandise.product.masterAssetId = masterAsset(
      'master-asset-123',
      'number_integer',
    );
    expectPass(run([line]));
  });
});

describe('native checkout bypass protection', () => {
  test('22. configured native/catalog price without authorization blocks', () => {
    const line = configuredLine({ checkoutProof: null });
    line.cost.amountPerQuantity.amount = '28.89';
    expectBlock(run([line]));
  });

  test('23. configured native/catalog price with forged authorization blocks', () => {
    const forged = signProof({
      secret: ATTACKER_SECRET,
      unitMinor: '2889',
    });
    const line = configuredLine({ checkoutProof: { value: forged } });
    line.cost.amountPerQuantity.amount = '28.89';
    expectBlock(run([line]));
  });
});

describe('exact EUR money parsing', () => {
  test.each([
    ['144.45', '14445'],
    ['144.450', '14445'],
    ['28.89', '2889'],
    ['0', '0'],
    ['0.00', '0'],
  ])('%s normalizes to %s minor units', (amount, expected) => {
    expect(parseEurMinorUnits(amount)).toBe(expected);
  });

  test.each([
    'malformed',
    '144.451',
    '-1.00',
    '1e2',
    '+1.00',
    '1,00',
    '.99',
    '01.00',
  ])('%s is rejected', (amount) => {
    expect(parseEurMinorUnits(amount)).toBeNull();
  });
});

describe('fixed proof-v1 interoperability vector', () => {
  test('matches independently generated SHA-256 and HMAC-SHA256 values', () => {
    expect(sha256Base64Url(PAYLOAD)).toBe(FIXED_PAYLOAD_SHA256);
    expect(
      buildCanonicalClaims({
        variantId: VARIANT_ID,
        instanceId: INSTANCE_ID,
        payloadSha256: FIXED_PAYLOAD_SHA256,
        quantity: '1',
        unitMinor: '14445',
        currency: 'EUR',
      }),
    ).toBe(FIXED_CANONICAL);
    expect(hmacSha256Base64Url(SECRET, FIXED_CANONICAL)).toBe(FIXED_SIGNATURE);
    expect(signProof()).toBe(FIXED_PROOF);
  });

  test('verifies harmless Shopify trailing-zero money formatting', () => {
    expect(
      verifyProofV1({
        proof: FIXED_PROOF,
        secret: SECRET,
        variantId: VARIANT_ID,
        instanceId: INSTANCE_ID,
        configuratorPayload: PAYLOAD,
        quantity: 1,
        amount: '144.450',
        currency: 'EUR',
      }),
    ).toBe(true);
  });
});
