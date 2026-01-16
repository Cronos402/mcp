/**
 * Facilitator Client Tests
 *
 * Tests for Cronos x402 facilitator API client
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Address, Hex } from 'viem';
import { CronosFacilitatorClient, createFacilitatorClient, getFacilitatorClient } from '../facilitator-client.js';
import { createAndSignTransfer } from '../eip3009-signer.js';

// Mock fetch globally
global.fetch = vi.fn() as any;

describe('Facilitator Client', () => {
  let client: CronosFacilitatorClient;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Create fresh client instance
    client = createFacilitatorClient({
      baseUrl: 'https://test-facilitator.cronos.org',
      timeout: 5000,
    });
  });

  describe('Constructor', () => {
    it('should create client with default config', () => {
      const defaultClient = new CronosFacilitatorClient();
      expect(defaultClient).toBeInstanceOf(CronosFacilitatorClient);
    });

    it('should create client with custom config', () => {
      const customClient = new CronosFacilitatorClient({
        baseUrl: 'https://custom-facilitator.com',
        timeout: 10000,
        headers: { 'X-Custom': 'value' },
      });
      expect(customClient).toBeInstanceOf(CronosFacilitatorClient);
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status', async () => {
      const mockResponse = {
        status: 'healthy' as const,
        timestamp: Date.now(),
      };

      (global.fetch as vi.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await client.healthCheck();

      expect(result.status).toBe('healthy');
      expect(result.timestamp).toBeDefined();
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/healthcheck'),
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should handle unhealthy status', async () => {
      const mockResponse = {
        status: 'unhealthy' as const,
        timestamp: Date.now(),
      };

      (global.fetch as vi.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await client.healthCheck();

      expect(result.status).toBe('unhealthy');
    });

    it('should throw on network error', async () => {
      (global.fetch as vi.MockedFunction<typeof fetch>).mockRejectedValueOnce(
        new Error('Network error')
      );

      await expect(client.healthCheck()).rejects.toThrow();
    });
  });

  describe('getSupportedNetworks', () => {
    it('should return supported networks list', async () => {
      const mockResponse = {
        networks: [
          {
            network: 'cronos-mainnet',
            chainId: 25,
            tokens: [
              {
                address: '0xf951eC28187D9E5Ca673Da8FE6757E6f0Be5F77C' as Address,
                symbol: 'USDC.e',
                decimals: 6,
              },
            ],
          },
          {
            network: 'cronos-testnet',
            chainId: 338,
            tokens: [
              {
                address: '0xc01efAaF7C5C61bEbFAeb358E1161b537b8bC0e0' as Address,
                symbol: 'devUSDC.e',
                decimals: 6,
              },
            ],
          },
        ],
      };

      (global.fetch as vi.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await client.getSupportedNetworks();

      expect(result.networks).toHaveLength(2);
      expect(result.networks?.[0]?.network).toBe('cronos-mainnet');
      expect(result.networks?.[1]?.network).toBe('cronos-testnet');
    });
  });

  describe('verifyPayment', () => {
    const testPrivateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex;
    const testAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Address;
    const recipient = '0x742D35cC6634C0532925A3b844bc9E7595f0BEb8' as Address;

    it('should verify valid payment', async () => {
      const authorization = await createAndSignTransfer(
        testAddress,
        recipient,
        '1',
        testPrivateKey,
        'cronos-testnet'
      );

      const mockResponse = {
        valid: true,
        verificationId: 'verify_123',
      };

      (global.fetch as vi.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await client.verifyPayment({
        network: 'cronos-testnet',
        token: '0xc01efAaF7C5C61bEbFAeb358E1161b537b8bC0e0' as Address,
        authorization,
      });

      expect(result.valid).toBe(true);
      expect(result.verificationId).toBe('verify_123');
    });

    it('should reject invalid payment', async () => {
      const authorization = await createAndSignTransfer(
        testAddress,
        recipient,
        '1',
        testPrivateKey,
        'cronos-testnet'
      );

      const mockResponse = {
        valid: false,
        reason: 'Insufficient balance',
      };

      (global.fetch as vi.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await client.verifyPayment({
        network: 'cronos-testnet',
        token: '0xc01efAaF7C5C61bEbFAeb358E1161b537b8bC0e0' as Address,
        authorization,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Insufficient balance');
    });
  });

  describe('settlePayment', () => {
    const testPrivateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex;
    const testAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Address;
    const recipient = '0x742D35cC6634C0532925A3b844bc9E7595f0BEb8' as Address;

    it('should settle payment successfully', async () => {
      const authorization = await createAndSignTransfer(
        testAddress,
        recipient,
        '1',
        testPrivateKey,
        'cronos-testnet'
      );

      const mockResponse = {
        success: true,
        txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as Hex,
      };

      (global.fetch as vi.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await client.settlePayment({
        network: 'cronos-testnet',
        token: '0xc01efAaF7C5C61bEbFAeb358E1161b537b8bC0e0' as Address,
        authorization,
      });

      expect(result.success).toBe(true);
      expect(result.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('should handle settlement failure', async () => {
      const authorization = await createAndSignTransfer(
        testAddress,
        recipient,
        '1',
        testPrivateKey,
        'cronos-testnet'
      );

      const mockResponse = {
        success: false,
        error: 'Gas estimation failed',
        reason: 'Network congestion',
      };

      (global.fetch as vi.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await client.settlePayment({
        network: 'cronos-testnet',
        token: '0xc01efAaF7C5C61bEbFAeb358E1161b537b8bC0e0' as Address,
        authorization,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should include verification ID if provided', async () => {
      const authorization = await createAndSignTransfer(
        testAddress,
        recipient,
        '1',
        testPrivateKey,
        'cronos-testnet'
      );

      const mockResponse = {
        success: true,
        txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as Hex,
      };

      (global.fetch as vi.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await client.settlePayment({
        network: 'cronos-testnet',
        token: '0xc01efAaF7C5C61bEbFAeb358E1161b537b8bC0e0' as Address,
        authorization,
        verificationId: 'verify_123',
      });

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('verify_123'),
        })
      );
    });
  });

  describe('verifyAndSettle', () => {
    const testPrivateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex;
    const testAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Address;
    const recipient = '0x742D35cC6634C0532925A3b844bc9E7595f0BEb8' as Address;

    it('should verify and settle in one operation', async () => {
      const authorization = await createAndSignTransfer(
        testAddress,
        recipient,
        '1',
        testPrivateKey,
        'cronos-testnet'
      );

      // Mock verify response
      (global.fetch as vi.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ valid: true, verificationId: 'verify_123' }),
      } as Response);

      // Mock settle response
      (global.fetch as vi.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as Hex,
        }),
      } as Response);

      const result = await client.verifyAndSettle(
        'cronos-testnet',
        '0xc01efAaF7C5C61bEbFAeb358E1161b537b8bC0e0' as Address,
        authorization
      );

      expect(result.success).toBe(true);
      expect(result.txHash).toBeDefined();
      expect(global.fetch).toHaveBeenCalledTimes(2); // verify + settle
    });

    it('should return error if verification fails', async () => {
      const authorization = await createAndSignTransfer(
        testAddress,
        recipient,
        '1',
        testPrivateKey,
        'cronos-testnet'
      );

      // Mock failed verify response
      (global.fetch as vi.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ valid: false, reason: 'Invalid signature' }),
      } as Response);

      const result = await client.verifyAndSettle(
        'cronos-testnet',
        '0xc01efAaF7C5C61bEbFAeb358E1161b537b8bC0e0' as Address,
        authorization
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Verification failed');
      expect(result.reason).toBe('Invalid signature');
      expect(global.fetch).toHaveBeenCalledTimes(1); // Only verify, no settle
    });
  });

  describe('Error Handling', () => {
    it('should handle timeout', async () => {
      const slowClient = new CronosFacilitatorClient({ timeout: 100 });

      // Mock slow response
      (global.fetch as vi.MockedFunction<typeof fetch>).mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(resolve, 500))
      );

      await expect(slowClient.healthCheck()).rejects.toThrow(/timeout/i);
    });

    it('should handle HTTP error responses', async () => {
      (global.fetch as vi.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal server error',
      } as Response);

      await expect(client.healthCheck()).rejects.toThrow(/500/);
    });

    it('should handle network errors', async () => {
      (global.fetch as vi.MockedFunction<typeof fetch>).mockRejectedValueOnce(
        new Error('Failed to fetch')
      );

      await expect(client.healthCheck()).rejects.toThrow();
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance from getFacilitatorClient', () => {
      const client1 = getFacilitatorClient();
      const client2 = getFacilitatorClient();

      expect(client1).toBe(client2);
    });

    it('should create new instance with createFacilitatorClient', () => {
      const client1 = createFacilitatorClient();
      const client2 = createFacilitatorClient();

      expect(client1).not.toBe(client2);
    });
  });
});
