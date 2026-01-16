/**
 * Cronos x402 Facilitator API Client
 * https://docs.cronos.org/cronos-x402-facilitator/api-reference
 *
 * The facilitator enables gasless USDC.e transfers on Cronos by:
 * 1. Verifying EIP-3009 signed authorizations
 * 2. Submitting transactions on-chain (paying gas fees)
 * 3. Providing settlement proofs for x402 payment verification
 */

import type { Address, Hex } from 'viem';
import type { SignedTransferAuthorization } from './eip3009-signer.js';
import { CRONOS_FACILITATOR, type CronosNetwork } from '../cronos-constants.js';

/**
 * Facilitator API Response Types
 */

export type SupportedNetwork = {
  network: string;
  chainId: number;
  tokens: Array<{
    address: Address;
    symbol: string;
    decimals: number;
  }>;
};

export type SupportedNetworksResponse = {
  networks: SupportedNetwork[];
};

export type VerifyPaymentRequest = {
  network: CronosNetwork;
  token: Address;
  authorization: SignedTransferAuthorization;
};

export type VerifyPaymentResponse = {
  valid: boolean;
  reason?: string;
  verificationId?: string;
};

export type SettlePaymentRequest = {
  network: CronosNetwork;
  token: Address;
  authorization: SignedTransferAuthorization;
  verificationId?: string;
};

export type SettlePaymentResponse = {
  success: boolean;
  txHash?: Hex;
  error?: string;
  reason?: string;
};

export type HealthCheckResponse = {
  status: 'healthy' | 'unhealthy';
  timestamp: number;
};

/**
 * Facilitator API Client Configuration
 */
export type FacilitatorConfig = {
  baseUrl?: string;
  timeout?: number;
  headers?: Record<string, string>;
};

/**
 * Cronos x402 Facilitator Client
 *
 * Handles gasless USDC.e payments through the Cronos facilitator service.
 * The facilitator verifies EIP-3009 signatures and submits transactions on-chain.
 */
export class CronosFacilitatorClient {
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly headers: Record<string, string>;

  constructor(config: FacilitatorConfig = {}) {
    this.baseUrl = config.baseUrl || CRONOS_FACILITATOR.BASE_URL;
    this.timeout = config.timeout || 30000; // 30 second default
    this.headers = {
      'Content-Type': 'application/json',
      ...config.headers,
    };
  }

  /**
   * Check facilitator health status
   */
  async healthCheck(): Promise<HealthCheckResponse> {
    const response = await this.fetch<HealthCheckResponse>(
      CRONOS_FACILITATOR.ENDPOINTS.HEALTH,
      { method: 'GET' }
    );
    return response;
  }

  /**
   * Get supported networks and tokens
   *
   * @returns List of networks supported by the facilitator
   */
  async getSupportedNetworks(): Promise<SupportedNetworksResponse> {
    const response = await this.fetch<SupportedNetworksResponse>(
      CRONOS_FACILITATOR.ENDPOINTS.SUPPORTED,
      { method: 'GET' }
    );
    return response;
  }

  /**
   * Verify a signed payment authorization
   *
   * This checks:
   * - Signature validity (EIP-712)
   * - Sender has sufficient balance
   * - Authorization hasn't expired
   * - Nonce hasn't been used
   *
   * @param request - Payment verification request
   * @returns Verification result with ID for settlement
   */
  async verifyPayment(request: VerifyPaymentRequest): Promise<VerifyPaymentResponse> {
    const response = await this.fetch<VerifyPaymentResponse>(
      CRONOS_FACILITATOR.ENDPOINTS.VERIFY,
      {
        method: 'POST',
        body: JSON.stringify({
          network: request.network,
          token: request.token,
          from: request.authorization.from,
          to: request.authorization.to,
          value: request.authorization.value.toString(),
          validAfter: request.authorization.validAfter.toString(),
          validBefore: request.authorization.validBefore.toString(),
          nonce: request.authorization.nonce,
          signature: request.authorization.signature,
        }),
      }
    );

    return response;
  }

  /**
   * Settle a verified payment authorization
   *
   * This executes the transfer on-chain:
   * - Facilitator calls transferWithAuthorization on USDC.e contract
   * - Facilitator pays gas fees
   * - Returns transaction hash for verification
   *
   * @param request - Payment settlement request
   * @returns Settlement result with transaction hash
   */
  async settlePayment(request: SettlePaymentRequest): Promise<SettlePaymentResponse> {
    const response = await this.fetch<SettlePaymentResponse>(
      CRONOS_FACILITATOR.ENDPOINTS.SETTLE,
      {
        method: 'POST',
        body: JSON.stringify({
          network: request.network,
          token: request.token,
          from: request.authorization.from,
          to: request.authorization.to,
          value: request.authorization.value.toString(),
          validAfter: request.authorization.validAfter.toString(),
          validBefore: request.authorization.validBefore.toString(),
          nonce: request.authorization.nonce,
          signature: request.authorization.signature,
          verificationId: request.verificationId,
        }),
      }
    );

    return response;
  }

  /**
   * Verify and settle a payment in one operation
   *
   * Convenience method that:
   * 1. Verifies the authorization
   * 2. If valid, settles the payment
   * 3. Returns the transaction hash
   *
   * @param network - Cronos network
   * @param token - Token address (USDC.e)
   * @param authorization - Signed EIP-3009 authorization
   * @returns Settlement result
   */
  async verifyAndSettle(
    network: CronosNetwork,
    token: Address,
    authorization: SignedTransferAuthorization
  ): Promise<SettlePaymentResponse> {
    // Step 1: Verify the authorization
    const verifyResult = await this.verifyPayment({
      network,
      token,
      authorization,
    });

    if (!verifyResult.valid) {
      return {
        success: false,
        error: 'Verification failed',
        reason: verifyResult.reason,
      };
    }

    // Step 2: Settle the payment
    const settleResult = await this.settlePayment({
      network,
      token,
      authorization,
      verificationId: verifyResult.verificationId,
    });

    return settleResult;
  }

  /**
   * Internal fetch wrapper with timeout and error handling
   */
  private async fetch<T>(endpoint: string, options: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers: this.headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(
          `Facilitator API error (${response.status}): ${errorText}`
        );
      }

      const data = await response.json();
      return data as T;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error(`Facilitator request timeout after ${this.timeout}ms`);
        }
        throw error;
      }

      throw new Error('Unknown error communicating with facilitator');
    }
  }
}

/**
 * Create a default facilitator client instance
 */
export function createFacilitatorClient(config?: FacilitatorConfig): CronosFacilitatorClient {
  return new CronosFacilitatorClient(config);
}

/**
 * Singleton default client instance
 */
let defaultClient: CronosFacilitatorClient | null = null;

/**
 * Get the default facilitator client instance (singleton)
 */
export function getFacilitatorClient(): CronosFacilitatorClient {
  if (!defaultClient) {
    defaultClient = createFacilitatorClient();
  }
  return defaultClient;
}
