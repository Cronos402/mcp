/**
 * Payment API Routes
 *
 * Handles signed payment submissions from clients and settles them via the Cronos facilitator.
 */

import type { Context } from 'hono';
import { z } from 'zod';
import type { Address, Hex } from 'viem';
import { getFacilitatorClient } from '../payment/facilitator-client.js';
import { getUsdcAddress, isCronosNetwork, type CronosNetwork } from '../cronos-constants.js';
import { validateTransferAuthorization } from '../payment/eip3009-signer.js';
import { verifyCroPayment } from '../payment/cro-payment.js';

/**
 * Request schema for submitting a signed USDC.e payment
 */
const SubmitUsdcPaymentSchema = z.object({
  network: z.string(),
  authorization: z.object({
    from: z.string(),
    to: z.string(),
    value: z.string(), // BigInt as string
    validAfter: z.string(), // BigInt as string
    validBefore: z.string(), // BigInt as string
    nonce: z.string(),
    signature: z.string(),
  }),
});

/**
 * POST /api/payment/usdc/submit
 *
 * Submit a signed USDC.e EIP-3009 authorization to the Cronos facilitator for settlement.
 *
 * Request body:
 * {
 *   "network": "cronos-mainnet" | "cronos-testnet",
 *   "authorization": {
 *     "from": "0x...",
 *     "to": "0x...",
 *     "value": "1000000", // Amount in USDC.e (6 decimals)
 *     "validAfter": "0",
 *     "validBefore": "1234567890",
 *     "nonce": "0x...",
 *     "signature": "0x..."
 *   }
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "txHash": "0x...",
 *   "message": "Payment settled successfully"
 * }
 */
export async function submitUsdcPayment(c: Context) {
  try {
    // Parse and validate request body
    const body = await c.req.json();
    const parsed = SubmitUsdcPaymentSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        {
          success: false,
          error: 'Invalid request body',
          details: parsed.error.issues,
        },
        400
      );
    }

    const { network, authorization } = parsed.data;

    // Validate network
    if (!isCronosNetwork(network)) {
      return c.json(
        {
          success: false,
          error: `Unsupported network: ${network}. Must be cronos-mainnet or cronos-testnet`,
        },
        400
      );
    }

    const cronosNetwork = network as CronosNetwork;

    // Convert string BigInts back to bigint
    const auth = {
      from: authorization.from as Address,
      to: authorization.to as Address,
      value: BigInt(authorization.value),
      validAfter: BigInt(authorization.validAfter),
      validBefore: BigInt(authorization.validBefore),
      nonce: authorization.nonce as Hex,
      signature: authorization.signature as Hex,
    };

    // Validate authorization before submitting
    const validation = validateTransferAuthorization(auth);
    if (!validation.valid) {
      return c.json(
        {
          success: false,
          error: 'Invalid authorization',
          reason: validation.error,
        },
        400
      );
    }

    // Get USDC.e address for the network
    const tokenAddress = getUsdcAddress(cronosNetwork);

    // Submit to facilitator
    const facilitator = getFacilitatorClient();

    console.log(`[PaymentAPI] Submitting USDC.e payment to facilitator on ${network}`);
    console.log(`[PaymentAPI] From: ${auth.from}, To: ${auth.to}, Amount: ${auth.value}`);

    const result = await facilitator.verifyAndSettle(cronosNetwork, tokenAddress, auth);

    if (!result.success || !result.txHash) {
      console.error('[PaymentAPI] Settlement failed:', result);
      return c.json(
        {
          success: false,
          error: 'Payment settlement failed',
          reason: result.reason || result.error,
        },
        500
      );
    }

    console.log(`[PaymentAPI] Payment settled successfully. Tx: ${result.txHash}`);

    return c.json({
      success: true,
      txHash: result.txHash,
      message: 'Payment settled successfully',
      network: cronosNetwork,
      explorerUrl: getExplorerUrl(cronosNetwork, result.txHash),
    });
  } catch (error) {
    console.error('[PaymentAPI] Error submitting payment:', error);

    return c.json(
      {
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
}

/**
 * Request schema for verifying a native CRO payment
 */
const VerifyCroPaymentSchema = z.object({
  network: z.string(),
  txHash: z.string(),
  expectedRecipient: z.string(),
  expectedAmount: z.string(), // Amount in CRO (e.g., "0.1")
  minConfirmations: z.number().optional().default(2),
});

/**
 * POST /api/payment/cro/verify
 *
 * Verify a native CRO payment transaction on-chain.
 *
 * Request body:
 * {
 *   "network": "cronos-mainnet" | "cronos-testnet",
 *   "txHash": "0x...",
 *   "expectedRecipient": "0x...",
 *   "expectedAmount": "0.1", // Amount in CRO
 *   "minConfirmations": 2  // Optional, default 2
 * }
 *
 * Response:
 * {
 *   "valid": true,
 *   "txHash": "0x...",
 *   "receipt": { ... },
 *   "message": "Payment verified successfully"
 * }
 */
export async function verifyCroPaymentEndpoint(c: Context) {
  try {
    // Parse and validate request body
    const body = await c.req.json();
    const parsed = VerifyCroPaymentSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        {
          success: false,
          error: 'Invalid request body',
          details: parsed.error.issues,
        },
        400
      );
    }

    const { network, txHash, expectedRecipient, expectedAmount, minConfirmations } = parsed.data;

    // Validate network
    if (!isCronosNetwork(network)) {
      return c.json(
        {
          success: false,
          error: `Unsupported network: ${network}. Must be cronos-mainnet or cronos-testnet`,
        },
        400
      );
    }

    const cronosNetwork = network as CronosNetwork;

    console.log(`[PaymentAPI] Verifying CRO payment on ${network}`);
    console.log(`[PaymentAPI] TxHash: ${txHash}, Recipient: ${expectedRecipient}, Amount: ${expectedAmount}`);

    // Verify payment on-chain
    const verification = await verifyCroPayment(
      txHash as Hex,
      expectedRecipient as Address,
      expectedAmount,
      cronosNetwork,
      minConfirmations
    );

    if (!verification.valid) {
      console.error('[PaymentAPI] Verification failed:', verification);
      return c.json(
        {
          valid: false,
          error: verification.error || 'Payment verification failed',
          reason: verification.reason,
          txHash: verification.txHash,
        },
        400
      );
    }

    console.log(`[PaymentAPI] Payment verified successfully. Tx: ${verification.txHash}`);

    return c.json({
      valid: true,
      txHash: verification.txHash,
      receipt: verification.receipt,
      message: 'Payment verified successfully',
      network: cronosNetwork,
      explorerUrl: getExplorerUrl(cronosNetwork, verification.txHash!),
    });
  } catch (error) {
    console.error('[PaymentAPI] Error verifying payment:', error);

    return c.json(
      {
        valid: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
}

/**
 * GET /api/payment/facilitator/health
 *
 * Check the health status of the Cronos facilitator service.
 *
 * Response:
 * {
 *   "healthy": true,
 *   "status": "healthy",
 *   "timestamp": 1234567890
 * }
 */
export async function checkFacilitatorHealth(c: Context) {
  try {
    const facilitator = getFacilitatorClient();
    const health = await facilitator.healthCheck();

    return c.json({
      healthy: health.status === 'healthy',
      ...health,
    });
  } catch (error) {
    console.error('[PaymentAPI] Health check failed:', error);

    return c.json(
      {
        healthy: false,
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Health check failed',
      },
      503
    );
  }
}

/**
 * GET /api/payment/facilitator/supported
 *
 * Get supported networks and tokens from the facilitator.
 *
 * Response:
 * {
 *   "networks": [
 *     {
 *       "network": "cronos-mainnet",
 *       "chainId": 25,
 *       "tokens": [...]
 *     }
 *   ]
 * }
 */
export async function getSupportedNetworks(c: Context) {
  try {
    const facilitator = getFacilitatorClient();
    const supported = await facilitator.getSupportedNetworks();

    return c.json(supported);
  } catch (error) {
    console.error('[PaymentAPI] Error fetching supported networks:', error);

    return c.json(
      {
        error: 'Failed to fetch supported networks',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
}

/**
 * Helper: Get block explorer URL for transaction
 */
function getExplorerUrl(network: CronosNetwork, txHash: Hex): string {
  const baseUrl =
    network === 'cronos-mainnet'
      ? 'https://cronoscan.com'
      : 'https://testnet.cronoscan.com';

  return `${baseUrl}/tx/${txHash}`;
}
