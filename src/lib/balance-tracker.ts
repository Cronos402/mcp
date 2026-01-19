import type { Address, Chain, HttpTransport } from 'viem';
import { createPublicClient, http, formatUnits } from 'viem';
import {
  type CronosNetwork,
  CRONOS_NETWORK,
  getChainId,
  getRpcUrl,
  getUsdcAddress,
  isCronosNetwork as checkIsCronosNetwork,
  CRO_METADATA,
  USDC_METADATA,
} from './cronos-constants.js';

// Re-export for external use
export { type CronosNetwork, isCronosNetwork } from './cronos-constants.js';

export type BalanceResult = {
  address: Address;
  network: CronosNetwork;
  chainId: number;
  nativeSymbol: string;
  balanceWei: bigint;
  balanceFormatted: string;
  decimals: number;
};

export type TokenBalanceResult = {
  address: Address;
  network: CronosNetwork;
  chainId: number;
  tokenAddress: Address;
  tokenSymbol: string;
  tokenName: string;
  decimals: number;
  balance: bigint;
  balanceFormatted: string;
};

// Minimal ERC20 ABI for balanceOf/decimals/symbol/name
const ERC20_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'name',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
] as const;

function getNativeSymbol(network: CronosNetwork): string {
  return network === CRONOS_NETWORK.MAINNET
    ? CRO_METADATA.SYMBOL.MAINNET
    : CRO_METADATA.SYMBOL.TESTNET;
}

function getUsdcSymbol(network: CronosNetwork): string {
  return network === CRONOS_NETWORK.MAINNET
    ? USDC_METADATA.SYMBOL.MAINNET
    : USDC_METADATA.SYMBOL.TESTNET;
}

function getEvmClient(network: CronosNetwork) {
  const chainId = getChainId(network);
  const rpcUrl = getRpcUrl(network);
  const transport: HttpTransport = http(rpcUrl);

  const chain: Chain = {
    id: chainId,
    name: network === CRONOS_NETWORK.MAINNET ? 'Cronos' : 'Cronos Testnet',
    nativeCurrency: {
      name: CRO_METADATA.NAME,
      symbol: getNativeSymbol(network),
      decimals: CRO_METADATA.DECIMALS,
    },
    rpcUrls: { default: { http: [rpcUrl] }, public: { http: [rpcUrl] } },
  } as unknown as Chain;

  return { chainId, client: createPublicClient({ chain, transport }) } as const;
}

export async function getNativeBalance(address: Address, network: CronosNetwork): Promise<BalanceResult> {
  const { chainId, client } = getEvmClient(network);
  const balanceWei = await client.getBalance({ address });
  const decimals = CRO_METADATA.DECIMALS;
  const balanceFormatted = formatUnits(balanceWei, decimals);
  return {
    address,
    network,
    chainId,
    nativeSymbol: getNativeSymbol(network),
    balanceWei,
    balanceFormatted,
    decimals,
  };
}

export async function getTokenBalance(address: Address, tokenAddress: Address, network: CronosNetwork): Promise<TokenBalanceResult> {
  const { chainId, client } = getEvmClient(network);

  const [rawBalance, tokenDecimals, tokenSymbol, tokenName] = await Promise.all([
    client.readContract({ address: tokenAddress, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }),
    client.readContract({ address: tokenAddress, abi: ERC20_ABI, functionName: 'decimals' }),
    client.readContract({ address: tokenAddress, abi: ERC20_ABI, functionName: 'symbol' }),
    client.readContract({ address: tokenAddress, abi: ERC20_ABI, functionName: 'name' }),
  ]);

  const balanceFormatted = formatUnits(rawBalance as bigint, Number(tokenDecimals));

  return {
    address,
    network,
    chainId,
    tokenAddress,
    tokenSymbol: String(tokenSymbol),
    tokenName: String(tokenName),
    decimals: Number(tokenDecimals),
    balance: rawBalance as bigint,
    balanceFormatted,
  };
}

export async function getUSDCBalance(address: Address, network: CronosNetwork): Promise<TokenBalanceResult | null> {
  const usdcAddress = getUsdcAddress(network);
  const { chainId, client } = getEvmClient(network);

  const rawBalance = await client.readContract({
    address: usdcAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address]
  });

  const decimals = USDC_METADATA.DECIMALS;
  const balanceFormatted = formatUnits(rawBalance as bigint, decimals);

  return {
    address,
    network,
    chainId,
    tokenAddress: usdcAddress,
    tokenSymbol: getUsdcSymbol(network),
    tokenName: USDC_METADATA.NAME,
    decimals,
    balance: rawBalance as bigint,
    balanceFormatted,
  };
}

export type AnyBalance = BalanceResult | TokenBalanceResult;

export async function getBalancesSummary(address: Address, network: CronosNetwork) {
  // Use Promise.allSettled to prevent single failure from crashing everything
  const results = await Promise.allSettled([
    getNativeBalance(address, network),
    getUSDCBalance(address, network),
  ]);

  // Extract results, returning null for failed requests
  const native = results[0].status === 'fulfilled' ? results[0].value : null;
  const usdc = results[1].status === 'fulfilled' ? results[1].value : null;

  // Log errors for debugging but don't crash
  if (results[0].status === 'rejected') {
    console.error('[BalanceTracker] Failed to get native balance:', results[0].reason);
  }
  if (results[1].status === 'rejected') {
    console.error('[BalanceTracker] Failed to get USDC balance:', results[1].reason);
  }

  return { native, usdc } as const;
}
