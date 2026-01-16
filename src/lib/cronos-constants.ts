/**
 * Cronos Network Constants
 * Source: https://docs.cronos.org/cronos-x402-facilitator/api-reference
 *
 * These are the official contract addresses and configuration from the Cronos documentation.
 * Do not modify these values unless the official documentation is updated.
 */

import type { Address } from 'viem';

// Network identifiers as used by the Cronos x402 facilitator
export const CRONOS_NETWORK = {
  MAINNET: 'cronos-mainnet',
  TESTNET: 'cronos-testnet',
} as const;

export type CronosNetwork = typeof CRONOS_NETWORK[keyof typeof CRONOS_NETWORK];

// Chain IDs
export const CRONOS_CHAIN_ID = {
  MAINNET: 25,
  TESTNET: 338,
} as const;

// RPC URLs
export const CRONOS_RPC_URL = {
  MAINNET: 'https://evm.cronos.org',
  TESTNET: 'https://evm-t3.cronos.org',
} as const;

// USDC.e Contract Addresses (Bridged USDC via Stargate)
// Source: Cronos x402 Facilitator API Reference
export const USDC_ADDRESS = {
  // Mainnet: USDC.e (Bridged USDC Stargate)
  MAINNET: '0xf951eC28187D9E5Ca673Da8FE6757E6f0Be5F77C' as Address,
  // Testnet: devUSDC.e (Test token for development)
  TESTNET: '0xc01efAaF7C5C61bEbFAeb358E1161b537b8bC0e0' as Address,
} as const;

// USDC.e Token Metadata
export const USDC_METADATA = {
  NAME: 'Bridged USDC (Stargate)',
  SYMBOL: {
    MAINNET: 'USDC.e',
    TESTNET: 'devUSDC.e',
  },
  DECIMALS: 6,
  VERSION: '1', // EIP-712 domain version
} as const;

// Native CRO Token (zero address represents native token)
export const CRO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;

export const CRO_METADATA = {
  NAME: 'Cronos',
  SYMBOL: {
    MAINNET: 'CRO',
    TESTNET: 'TCRO',
  },
  DECIMALS: 18,
} as const;

// Cronos x402 Facilitator
export const CRONOS_FACILITATOR = {
  BASE_URL: 'https://facilitator.cronoslabs.org',
  X402_URL: 'https://facilitator.cronoslabs.org/v2/x402',
  ENDPOINTS: {
    HEALTH: '/healthcheck',
    SUPPORTED: '/v2/x402/supported',
    VERIFY: '/v2/x402/verify',
    SETTLE: '/v2/x402/settle',
  },
} as const;

// Block Explorer URLs
export const CRONOS_EXPLORER = {
  MAINNET: 'https://cronoscan.com',
  TESTNET: 'https://testnet.cronoscan.com',
} as const;

// Faucet URLs (for testnet)
export const CRONOS_FAUCET = {
  CRO: 'https://cronos.org/faucet',
  USDC: 'https://faucet.cronos.org',
} as const;

/**
 * Payment requirements structure (Cronos-specific)
 */
export interface CronosPaymentRequirements {
  scheme: 'exact';
  network: CronosNetwork | string;
  maxAmountRequired: string;
  payTo: string;
  asset: string;
  maxTimeoutSeconds?: number;
  resource?: string;
  mimeType?: string;
  description?: string;
  extra?: Record<string, unknown>;
}

// Helper functions
export function getUsdcAddress(network: CronosNetwork): Address {
  return network === CRONOS_NETWORK.MAINNET
    ? USDC_ADDRESS.MAINNET
    : USDC_ADDRESS.TESTNET;
}

export function getChainId(network: CronosNetwork): number {
  return network === CRONOS_NETWORK.MAINNET
    ? CRONOS_CHAIN_ID.MAINNET
    : CRONOS_CHAIN_ID.TESTNET;
}

export function getRpcUrl(network: CronosNetwork): string {
  return network === CRONOS_NETWORK.MAINNET
    ? CRONOS_RPC_URL.MAINNET
    : CRONOS_RPC_URL.TESTNET;
}

export function getExplorerUrl(network: CronosNetwork): string {
  return network === CRONOS_NETWORK.MAINNET
    ? CRONOS_EXPLORER.MAINNET
    : CRONOS_EXPLORER.TESTNET;
}

export function isCronosNetwork(network: string): network is CronosNetwork {
  return network === CRONOS_NETWORK.MAINNET || network === CRONOS_NETWORK.TESTNET;
}

// EIP-712 Domain for USDC.e (required for EIP-3009 signatures)
export function getUsdcEip712Domain(network: CronosNetwork) {
  return {
    name: USDC_METADATA.NAME,
    version: USDC_METADATA.VERSION,
    chainId: getChainId(network),
    verifyingContract: getUsdcAddress(network),
  };
}
