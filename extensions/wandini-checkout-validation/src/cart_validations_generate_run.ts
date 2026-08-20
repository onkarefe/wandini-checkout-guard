import type {
  CartValidationsGenerateRunInput,
  CartValidationsGenerateRunResult,
  ValidationError,
} from '../generated/api';
import { BuyerJourneyStep } from '../generated/api';
import {
  isValidHmacSecret,
  verifyProofV1,
} from './proof';

const VALIDATION_MESSAGE =
  'This customized item could not be validated. Please return to your cart and try again.';

type TrustedMetafield = {
  type: string;
  value: string;
} | null | undefined;

type Classification = 'ordinary' | 'configured' | 'invalid';

function isValidMasterAssetId(metafield: TrustedMetafield): boolean {
  if (!metafield) return false;
  const { value } = metafield;
  return (
    value.length >= 1 &&
    value === value.trim() &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function isValidPrintQualityReference(metafield: TrustedMetafield): boolean {
  return (
    metafield?.type === 'metaobject_reference' &&
    /^gid:\/\/shopify\/Metaobject\/[1-9][0-9]*$/.test(metafield.value)
  );
}

function classifyTrustedProduct(
  masterAssetId: TrustedMetafield,
  printQuality: TrustedMetafield,
): Classification {
  const masterExists = masterAssetId != null;
  const qualityExists = printQuality != null;
  const masterValid = isValidMasterAssetId(masterAssetId);
  const qualityValid = isValidPrintQualityReference(printQuality);

  if (!masterExists && !qualityExists) return 'ordinary';
  if (masterValid && qualityValid) return 'configured';
  return 'invalid';
}

function validationError(): ValidationError {
  return {
    message: VALIDATION_MESSAGE,
    target: '$.cart',
  };
}

function isCheckoutStep(step: BuyerJourneyStep | null | undefined): boolean {
  return (
    step === BuyerJourneyStep.CheckoutInteraction ||
    step === BuyerJourneyStep.CheckoutCompletion
  );
}

export function cartValidationsGenerateRun(
  input: CartValidationsGenerateRunInput,
): CartValidationsGenerateRunResult {
  if (!isCheckoutStep(input.buyerJourney.step)) {
    return { operations: [{ validationAdd: { errors: [] } }] };
  }

  const secretMetafield = input.validation.hmacSecret;
  const secret =
    secretMetafield?.type === 'single_line_text_field' &&
    isValidHmacSecret(secretMetafield.value)
      ? secretMetafield.value
      : null;

  let shouldBlock = false;
  const configuredInstanceIds = new Set<string>();

  for (const line of input.cart.lines) {
    if (line.merchandise.__typename !== 'ProductVariant') continue;

    const classification = classifyTrustedProduct(
      line.merchandise.product.masterAssetId,
      line.merchandise.printQuality,
    );

    if (classification === 'ordinary') continue;
    if (classification === 'invalid' || !secret) {
      shouldBlock = true;
      continue;
    }

    const payload = line.configuratorPayload?.value;
    const instanceId = line.configuratorInstanceId?.value;
    const proof = line.checkoutProof?.value;

    if (instanceId) {
      if (configuredInstanceIds.has(instanceId)) {
        shouldBlock = true;
      } else {
        configuredInstanceIds.add(instanceId);
      }
    }

    if (
      !payload ||
      !instanceId ||
      !proof ||
      !verifyProofV1({
        proof,
        secret,
        variantId: line.merchandise.id,
        instanceId,
        configuratorPayload: payload,
        quantity: line.quantity,
        amount: line.cost.amountPerQuantity.amount,
        currency: line.cost.amountPerQuantity.currencyCode,
      })
    ) {
      shouldBlock = true;
    }
  }

  return {
    operations: [
      {
        validationAdd: {
          errors: shouldBlock ? [validationError()] : [],
        },
      },
    ],
  };
}
