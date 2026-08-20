import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { utf8ToBytes } from '@noble/hashes/utils';

export const PROOF_VERSION = 'v1';
export const CONFIGURED_CURRENCY = 'EUR';

const BASE64URL_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const BASE64URL_32_BYTES = /^[A-Za-z0-9_-]{43}$/;
const BASE64URL_FIELD = /^[A-Za-z0-9_-]+$/;
const CANONICAL_MINOR_UNITS = /^(0|[1-9][0-9]*)$/;
const CURRENCY_CODE = /^[A-Z]{3}$/;
const MAX_MONEY_MAJOR_DIGITS = 64;

export interface ProofV1Claims {
  variantId: string;
  instanceId: string;
  payloadSha256: string;
  quantity: '1';
  unitMinor: string;
  currency: string;
}

export interface ParsedProofV1 {
  claims: ProofV1Claims;
  canonical: string;
  signature: string;
}

export function encodeBase64Url(bytes: Uint8Array): string {
  let encoded = '';

  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const hasSecond = index + 1 < bytes.length;
    const hasThird = index + 2 < bytes.length;
    const second = hasSecond ? bytes[index + 1] : 0;
    const third = hasThird ? bytes[index + 2] : 0;
    const block = (first << 16) | (second << 8) | third;

    encoded += BASE64URL_ALPHABET[(block >>> 18) & 63];
    encoded += BASE64URL_ALPHABET[(block >>> 12) & 63];
    if (hasSecond) encoded += BASE64URL_ALPHABET[(block >>> 6) & 63];
    if (hasThird) encoded += BASE64URL_ALPHABET[block & 63];
  }

  return encoded;
}

export function encodeUtf8Base64Url(value: string): string {
  return encodeBase64Url(utf8ToBytes(value));
}

export function sha256Base64Url(value: string): string {
  return encodeBase64Url(sha256(utf8ToBytes(value)));
}

export function hmacSha256Base64Url(secret: string, canonical: string): string {
  return encodeBase64Url(
    hmac(sha256, utf8ToBytes(secret), utf8ToBytes(canonical)),
  );
}

export function parseEurMinorUnits(amount: string): string | null {
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/.exec(amount);
  if (!match || match[1].length > MAX_MONEY_MAJOR_DIGITS) return null;

  const fraction = match[2] ?? '';
  if (fraction.length > 2 && /[1-9]/.test(fraction.slice(2))) return null;

  const twoDigitFraction = (fraction + '00').slice(0, 2);
  const combined = match[1] + twoDigitFraction;
  return combined.replace(/^0+(?=[0-9])/, '');
}

export function isStructurallyValidInstanceId(value: string): boolean {
  if (value.length === 0 || /[\u0000-\u001f\u007f]/.test(value)) return false;
  const byteLength = utf8ToBytes(value).length;
  return byteLength >= 1 && byteLength <= 128;
}

export function isValidHmacSecret(value: string | null | undefined): value is string {
  if (!value || !/^[\x21-\x7e]+$/.test(value)) return false;
  return value.length >= 32 && value.length <= 128;
}

export function buildCanonicalClaims(claims: ProofV1Claims): string {
  return [
    PROOF_VERSION,
    encodeUtf8Base64Url(claims.variantId),
    encodeUtf8Base64Url(claims.instanceId),
    claims.payloadSha256,
    claims.quantity,
    claims.unitMinor,
    claims.currency,
  ].join('.');
}

export function parseProofV1(proof: string): ParsedProofV1 | null {
  if (proof.length > 512) return null;
  const fields = proof.split('.');
  if (fields.length !== 8) return null;

  const [
    version,
    encodedVariant,
    encodedInstance,
    payloadSha256,
    quantity,
    unitMinor,
    currency,
    signature,
  ] = fields;

  if (
    version !== PROOF_VERSION ||
    !BASE64URL_FIELD.test(encodedVariant) ||
    encodedVariant.length > 171 ||
    !BASE64URL_FIELD.test(encodedInstance) ||
    encodedInstance.length > 171 ||
    !BASE64URL_32_BYTES.test(payloadSha256) ||
    quantity !== '1' ||
    !CANONICAL_MINOR_UNITS.test(unitMinor) ||
    unitMinor.length > MAX_MONEY_MAJOR_DIGITS + 2 ||
    !CURRENCY_CODE.test(currency) ||
    !BASE64URL_32_BYTES.test(signature)
  ) {
    return null;
  }

  return {
    claims: {
      variantId: encodedVariant,
      instanceId: encodedInstance,
      payloadSha256,
      quantity: '1',
      unitMinor,
      currency,
    },
    canonical: fields.slice(0, 7).join('.'),
    signature,
  };
}

export function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;

  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return difference === 0;
}

export interface VerifyProofV1Input {
  proof: string;
  secret: string;
  variantId: string;
  instanceId: string;
  configuratorPayload: string;
  quantity: number;
  amount: string;
  currency: string;
}

export function verifyProofV1(input: VerifyProofV1Input): boolean {
  if (
    input.quantity !== 1 ||
    input.configuratorPayload.length === 0 ||
    !isStructurallyValidInstanceId(input.instanceId) ||
    input.currency !== CONFIGURED_CURRENCY ||
    !isValidHmacSecret(input.secret)
  ) {
    return false;
  }

  const unitMinor = parseEurMinorUnits(input.amount);
  const parsed = parseProofV1(input.proof);
  if (!unitMinor || !parsed) return false;

  if (
    parsed.claims.variantId !== encodeUtf8Base64Url(input.variantId) ||
    parsed.claims.instanceId !== encodeUtf8Base64Url(input.instanceId) ||
    parsed.claims.payloadSha256 !== sha256Base64Url(input.configuratorPayload) ||
    parsed.claims.quantity !== String(input.quantity) ||
    parsed.claims.unitMinor !== unitMinor ||
    parsed.claims.currency !== input.currency
  ) {
    return false;
  }

  const expectedSignature = hmacSha256Base64Url(input.secret, parsed.canonical);
  return constantTimeEqual(parsed.signature, expectedSignature);
}
