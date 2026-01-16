/**
 * Native CRO Payment Implementation
 *
 * Handles direct CRO transfers (user pays gas)
 * Unlike USDC.e, this requires wallet to send transaction and pay gas fees
 */

import {
  type Address,
  type Hash,
  type Hex,
  type TransactionReceipt,
  parseUnits,
  formatUnits,
  createPublicClient,
  http,
} from 'viem';
import { cronos, cronosTestnet } from 'viem/chains';
import {
  CRONOS_NETWORK,
  CRO_METADATA,
  CRO_ADDRESS,
  type CronosNetwork,
  getChainId,
  getRpcUrl,
} from '../cronos-constants.js';

/**
 * CRO transaction parameters
 */
export interface CroTransaction {
  from: Address;
  to: Address;
  value: bigint;
  chainId: number;
  nonce?: number;
  gasLimit?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
}

/**
 * Signed CRO transaction
 */
export interface SignedCroTransaction extends CroTransaction {
  hash: Hash;
}

/**
 * CRO payment verification result
 */
export interface CroPaymentVerification {
  valid: boolean;
  txHash?: Hash;
  receipt?: TransactionReceipt;
  error?: string;
  reason?: string;
}

/**
 * Build a native CRO transaction
 *
 * @param from - Sender address
 * @param to - Recipient address
 * @param amountCro - Amount in CRO (e.g., "0.1" for 0.1 CRO)
 * @param network - Cronos network (mainnet or testnet)
 * @returns CRO transaction parameters
 */
export function buildCroTransaction(
  from: Address,
  to: Address,
  amountCro: string,
  network: CronosNetwork
): CroTransaction {
  const value = parseUnits(amountCro, CRO_METADATA.DECIMALS);
  const chainId = getChainId(network);

  return {
    from,
    to,
    value,
    chainId,
    // Gas parameters will be estimated by wallet
    gasLimit: 21000n, // Standard ETH transfer gas
  };
}

/**
 * Create payment requirement for native CRO
 *
 * @param recipient - Payment recipient address
 * @param amountCro - Amount in CRO
 * @param network - Cronos network
 * @param description - Optional payment description
 * @returns Payment requirement object
 */
export function createCroPaymentRequirement(
  recipient: Address,
  amountCro: string,
  network: CronosNetwork,
  description?: string
) {
  const value = parseUnits(amountCro, CRO_METADATA.DECIMALS);
  const chainId = getChainId(network);
  const symbol = network === CRONOS_NETWORK.MAINNET
    ? CRO_METADATA.SYMBOL.MAINNET
    : CRO_METADATA.SYMBOL.TESTNET;

  return {
    type: 'crypto' as const,
    network: network,
    token: CRO_ADDRESS,
    symbol,
    amount: value.toString(),
    decimals: CRO_METADATA.DECIMALS,
    recipient,
    chainId,
    description: description || `Pay ${amountCro} ${symbol}`,
    // CRO payments are direct transactions (user pays gas)
    requiresSignature: true,
    gasless: false,
  };
}

/**
 * Validate CRO transaction parameters
 *
 * @param transaction - CRO transaction to validate
 * @returns Validation result
 */
export function validateCroTransaction(transaction: CroTransaction): {
  valid: boolean;
  error?: string;
} {
  // Check amount is positive
  if (transaction.value <= 0n) {
    return { valid: false, error: 'Transfer amount must be positive' };
  }

  // Check not sending to self
  if (transaction.from.toLowerCase() === transaction.to.toLowerCase()) {
    return { valid: false, error: 'Cannot transfer to self' };
  }

  // Check for zero address
  if (transaction.to === CRO_ADDRESS) {
    return { valid: false, error: 'Cannot transfer to zero address' };
  }

  return { valid: true };
}

/**
 * Get public client for on-chain verification
 */
function getPublicClient(network: CronosNetwork) {
  const chain = network === CRONOS_NETWORK.MAINNET ? cronos : cronosTestnet;
  const rpcUrl = getRpcUrl(network);

  return createPublicClient({
    chain,
    transport: http(rpcUrl),
  });
}

/**
 * Verify CRO payment on-chain
 *
 * @param txHash - Transaction hash to verify
 * @param expectedRecipient - Expected recipient address
 * @param expectedAmount - Expected amount in CRO
 * @param network - Cronos network
 * @param minConfirmations - Minimum confirmations required (default: 2)
 * @returns Verification result with receipt
 */
export async function verifyCroPayment(
  txHash: Hash,
  expectedRecipient: Address,
  expectedAmount: string,
  network: CronosNetwork,
  minConfirmations: number = 2
): Promise<CroPaymentVerification> {
  try {
    const client = getPublicClient(network);

    // Get transaction receipt
    const receipt = await client.getTransactionReceipt({ hash: txHash });

    if (!receipt) {
      return {
        valid: false,
        error: 'Transaction not found',
      };
    }

    // Check transaction success
    if (receipt.status !== 'success') {
      return {
        valid: false,
        txHash,
        receipt,
        error: 'Transaction failed',
        reason: 'Transaction was reverted',
      };
    }

    // Get transaction details
    const tx = await client.getTransaction({ hash: txHash });

    if (!tx) {
      return {
        valid: false,
        txHash,
        error: 'Transaction details not found',
      };
    }

    // Verify recipient
    if (tx.to?.toLowerCase() !== expectedRecipient.toLowerCase()) {
      return {
        valid: false,
        txHash,
        receipt,
        error: 'Invalid recipient',
        reason: `Expected ${expectedRecipient}, got ${tx.to}`,
      };
    }

    // Verify amount
    const expectedValue = parseUnits(expectedAmount, CRO_METADATA.DECIMALS);
    if (tx.value < expectedValue) {
      return {
        valid: false,
        txHash,
        receipt,
        error: 'Insufficient amount',
        reason: `Expected ${formatUnits(expectedValue, CRO_METADATA.DECIMALS)} CRO, got ${formatUnits(tx.value, CRO_METADATA.DECIMALS)} CRO`,
      };
    }

    // Check confirmations
    const currentBlock = await client.getBlockNumber();
    const confirmations = Number(currentBlock - receipt.blockNumber);

    if (confirmations < minConfirmations) {
      return {
        valid: false,
        txHash,
        receipt,
        error: 'Insufficient confirmations',
        reason: `Transaction has ${confirmations} confirmations, need ${minConfirmations}`,
      };
    }

    return {
      valid: true,
      txHash,
      receipt,
    };
  } catch (error) {
    return {
      valid: false,
      error: 'Verification failed',
      reason: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check if an address has sufficient CRO balance
 *
 * @param address - Address to check
 * @param amountCro - Required amount in CRO
 * @param network - Cronos network
 * @returns True if balance is sufficient
 */
export async function checkCroBalance(
  address: Address,
  amountCro: string,
  network: CronosNetwork
): Promise<{ sufficient: boolean; balance: string; required: string }> {
  const client = getPublicClient(network);
  const balance = await client.getBalance({ address });
  const required = parseUnits(amountCro, CRO_METADATA.DECIMALS);

  return {
    sufficient: balance >= required,
    balance: formatUnits(balance, CRO_METADATA.DECIMALS),
    required: amountCro,
  };
}
