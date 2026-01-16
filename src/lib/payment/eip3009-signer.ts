/**
 * EIP-3009: Transfer With Authorization
 * https://eips.ethereum.org/EIPS/eip-3009
 *
 * Implements gasless USDC.e transfers on Cronos via EIP-712 signatures.
 * The Cronos facilitator submits these signatures on-chain and pays gas fees.
 */

import { type Address, type Hex, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { CronosNetwork } from '../cronos-constants.js';
import { getUsdcEip712Domain, getUsdcAddress } from '../cronos-constants.js';

/**
 * EIP-3009 Transfer Authorization Payload
 * This is what gets signed by the user and submitted to the facilitator
 */
export type TransferAuthorization = {
  from: Address;
  to: Address;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: Hex;
};

/**
 * Complete authorization with signature
 * This is what the facilitator needs to execute the transfer on-chain
 */
export type SignedTransferAuthorization = TransferAuthorization & {
  signature: Hex;
};

/**
 * EIP-712 typed data structure for transferWithAuthorization
 * Must match the USDC.e contract's EIP-712 domain and types
 */
const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

/**
 * Generate a unique nonce for the authorization
 * Format: timestamp (8 bytes) + random bytes (24 bytes) = 32 bytes total
 *
 * This ensures:
 * - Each signature is unique (prevents replay attacks)
 * - Nonces are ordered by time (helps with debugging)
 * - Sufficient entropy (24 random bytes)
 */
export function generateNonce(): Hex {
  const timestamp = BigInt(Date.now());
  const randomBytes = crypto.getRandomValues(new Uint8Array(24));

  // Combine timestamp (8 bytes) + random (24 bytes) into 32-byte hex string
  const timestampHex = timestamp.toString(16).padStart(16, '0'); // 8 bytes
  const randomHex = Array.from(randomBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return `0x${timestampHex}${randomHex}` as Hex;
}

/**
 * Create an EIP-3009 transfer authorization
 *
 * @param from - Sender's wallet address
 * @param to - Recipient's wallet address
 * @param amount - Amount in USDC (e.g., "0.01" for 1 cent)
 * @param validityWindow - How long the signature is valid (in seconds, default 1 hour)
 * @returns Unsigned transfer authorization
 */
export function createTransferAuthorization(
  from: Address,
  to: Address,
  amount: string,
  validityWindow: number = 3600 // 1 hour default
): TransferAuthorization {
  const now = BigInt(Math.floor(Date.now() / 1000));

  // USDC.e has 6 decimals (not 18 like ETH!)
  const value = parseUnits(amount, 6);

  return {
    from,
    to,
    value,
    validAfter: 0n, // Valid immediately
    validBefore: now + BigInt(validityWindow), // Valid for specified duration
    nonce: generateNonce(),
  };
}

/**
 * Sign an EIP-3009 transfer authorization using EIP-712
 *
 * @param authorization - The transfer authorization to sign
 * @param privateKey - User's private key (0x-prefixed hex string)
 * @param network - Cronos network (mainnet or testnet)
 * @returns Signed authorization ready for facilitator submission
 */
export async function signTransferAuthorization(
  authorization: TransferAuthorization,
  privateKey: Hex,
  network: CronosNetwork
): Promise<SignedTransferAuthorization> {
  const account = privateKeyToAccount(privateKey);

  // Get USDC.e EIP-712 domain for the network
  const domain = getUsdcEip712Domain(network);

  // Sign the typed data
  const signature = await account.signTypedData({
    domain,
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: 'TransferWithAuthorization',
    message: authorization,
  });

  return {
    ...authorization,
    signature,
  };
}

/**
 * Convenience function to create and sign a transfer in one step
 *
 * @param from - Sender's wallet address
 * @param to - Recipient's wallet address
 * @param amount - Amount in USDC (e.g., "0.01")
 * @param privateKey - User's private key
 * @param network - Cronos network
 * @param validityWindow - Signature validity duration in seconds
 * @returns Signed authorization ready for facilitator
 */
export async function createAndSignTransfer(
  from: Address,
  to: Address,
  amount: string,
  privateKey: Hex,
  network: CronosNetwork,
  validityWindow?: number
): Promise<SignedTransferAuthorization> {
  const authorization = createTransferAuthorization(from, to, amount, validityWindow);
  return signTransferAuthorization(authorization, privateKey, network);
}

/**
 * Validate that a transfer authorization is well-formed
 *
 * @param auth - Authorization to validate
 * @returns Validation result with error message if invalid
 */
export function validateTransferAuthorization(
  auth: TransferAuthorization
): { valid: boolean; error?: string } {
  if (auth.value <= 0n) {
    return { valid: false, error: 'Transfer amount must be positive' };
  }

  if (auth.from === auth.to) {
    return { valid: false, error: 'Cannot transfer to self' };
  }

  const now = BigInt(Math.floor(Date.now() / 1000));

  if (auth.validBefore <= now) {
    return { valid: false, error: 'Authorization has expired' };
  }

  if (auth.validAfter > now) {
    return { valid: false, error: 'Authorization not yet valid' };
  }

  if (auth.nonce.length !== 66) { // 0x + 64 hex chars = 32 bytes
    return { valid: false, error: 'Invalid nonce format' };
  }

  return { valid: true };
}
