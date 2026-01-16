/**
 * Cronos Payment Signing Strategy
 *
 * Implements payment signing for:
 * 1. USDC.e - Gasless via Cronos facilitator (EIP-3009)
 * 2. Native CRO - Direct wallet transactions
 */

import type { Address, Hex } from 'viem';
import type { PaymentSigningStrategy, PaymentSigningContext, PaymentSigningResult } from './index.js';
import type { CronosPaymentRequirements as PaymentRequirements } from '../../cronos-constants.js';
import {
  createAndSignTransfer,
  type SignedTransferAuthorization,
} from '../../payment/eip3009-signer.js';
import {
  createFacilitatorClient,
  type CronosFacilitatorClient,
} from '../../payment/facilitator-client.js';
import {
  type CronosNetwork,
  isCronosNetwork,
  getUsdcAddress,
  CRO_ADDRESS,
} from '../../cronos-constants.js';
import { txOperations } from '../../db/actions.js';

/**
 * Cronos Payment Strategy
 *
 * Handles payment signing for Cronos blockchain:
 * - USDC.e payments via EIP-3009 + facilitator (gasless)
 * - Native CRO payments via direct transactions (user pays gas)
 */
export class CronosPaymentStrategy implements PaymentSigningStrategy {
  readonly name = 'Cronos Payment Strategy';
  readonly priority = 1;

  private facilitatorClient: CronosFacilitatorClient;

  constructor(facilitatorUrl?: string) {
    this.facilitatorClient = createFacilitatorClient({
      baseUrl: facilitatorUrl,
    });
  }

  /**
   * Check if this strategy can sign the payment
   *
   * Requirements:
   * - User must have a connected wallet
   * - Payment must be on Cronos network
   * - Asset must be USDC.e or native CRO
   */
  async canSign(context: PaymentSigningContext): Promise<boolean> {
    const { user, paymentRequirement } = context;

    // Check if user has any wallets connected
    const hasWallets = await txOperations.userHasWallets(user.id);
    if (!hasWallets) {
      return false;
    }

    // Check if payment requirement is for Cronos
    const network = paymentRequirement.network;
    if (!isCronosNetwork(network)) {
      return false;
    }

    // Check if asset is supported (USDC.e or native CRO)
    const asset = paymentRequirement.asset;
    const cronosNetwork = network as CronosNetwork;
    const usdcAddress = getUsdcAddress(cronosNetwork);
    const isUsdc = asset.toLowerCase() === usdcAddress.toLowerCase();
    const isCro = asset === CRO_ADDRESS || asset === '0x0' || asset.toLowerCase() === CRO_ADDRESS.toLowerCase();

    return isUsdc || isCro;
  }

  /**
   * Sign the payment
   *
   * For USDC.e: Creates EIP-3009 signature and settles via facilitator
   * For CRO: Returns instruction to use wallet client
   */
  async signPayment(context: PaymentSigningContext): Promise<PaymentSigningResult> {
    const { user, paymentRequirement } = context;

    try {
      const network = paymentRequirement.network as CronosNetwork;
      const asset = paymentRequirement.asset;
      const amount = paymentRequirement.maxAmountRequired;
      const recipient = paymentRequirement.payTo as Address;

      // Get user's wallet
      const wallets = await txOperations.getWalletsByUser(user.id);
      if (!wallets || wallets.length === 0) {
        return {
          success: false,
          error: 'No wallet connected. Please connect a Cronos wallet.',
        };
      }

      const wallet = wallets[0]; // Use first wallet for now
      const walletAddress = wallet.walletAddress as Address;

      // Check if USDC.e or CRO
      const usdcAddress = getUsdcAddress(network);
      const isUsdc = asset.toLowerCase() === usdcAddress.toLowerCase();

      if (isUsdc) {
        return await this.signUsdcPayment(
          network,
          amount,
          recipient,
          walletAddress,
          paymentRequirement
        );
      }

      // For native CRO, we need wallet client
      return {
        success: false,
        error: 'Native CRO payments require wallet client (MetaMask, etc.). Please use the web interface to complete this payment.',
        walletAddress,
      };
    } catch (error) {
      console.error('[CronosStrategy] Payment signing error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown payment signing error',
      };
    }
  }

  /**
   * Sign USDC.e payment using EIP-3009 and settle via facilitator
   *
   * TODO: Implement proper wallet signing
   * For now, this requires private key access which is not secure.
   * Need to implement:
   * - WalletConnect integration
   * - MetaMask signature requests
   * - Crypto.com Wallet integration
   */
  private async signUsdcPayment(
    network: CronosNetwork,
    amount: string,
    recipient: Address,
    sender: Address,
    paymentRequirement: PaymentRequirements
  ): Promise<PaymentSigningResult> {
    // TODO: Get private key from secure storage or wallet connection
    // For now, this will fail without private key access
    // This needs to be implemented with proper wallet integration

    return {
      success: false,
      error: 'USDC.e payment signing requires wallet integration (coming soon). Please use the web interface with MetaMask or Crypto.com Wallet.',
      walletAddress: sender,
    };

    /*
    // Future implementation:
    const privateKey = await this.getPrivateKeyFromWallet(sender);

    const authorization = await createAndSignTransfer(
      sender,
      recipient,
      amount,
      privateKey,
      network
    );

    // Settle via facilitator
    const result = await this.settleUsdcPayment(authorization, network);

    // Create x402 payment header
    const paymentHeader = this.createPaymentHeader(result.txHash, authorization);

    return {
      success: true,
      signedPaymentHeader: paymentHeader,
      strategy: this.name,
      walletAddress: sender,
    };
    */
  }

  /**
   * Settle USDC.e payment via facilitator
   *
   * @param authorization - Signed EIP-3009 authorization
   * @param network - Cronos network
   * @returns Transaction hash of the settlement
   */
  async settleUsdcPayment(
    authorization: SignedTransferAuthorization,
    network: CronosNetwork
  ): Promise<{ txHash: Hex; success: boolean }> {
    const tokenAddress = getUsdcAddress(network);

    const result = await this.facilitatorClient.verifyAndSettle(
      network,
      tokenAddress,
      authorization
    );

    if (!result.success || !result.txHash) {
      throw new Error(`Payment settlement failed: ${result.reason || result.error}`);
    }

    return {
      txHash: result.txHash,
      success: true,
    };
  }

  /**
   * Create x402 payment header from transaction hash
   *
   * Format: network:asset:txHash
   */
  private createPaymentHeader(txHash: Hex, authorization: SignedTransferAuthorization): string {
    // x402 payment header format (to be verified against x402 spec)
    return JSON.stringify({
      txHash,
      authorization,
    });
  }

  /**
   * Check facilitator health
   */
  async checkHealth(): Promise<boolean> {
    try {
      const health = await this.facilitatorClient.healthCheck();
      return health.status === 'healthy';
    } catch {
      return false;
    }
  }
}

/**
 * Create a Cronos payment strategy instance
 */
export function createCronosStrategy(facilitatorUrl?: string): CronosPaymentStrategy {
  return new CronosPaymentStrategy(facilitatorUrl);
}
