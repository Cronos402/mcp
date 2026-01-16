/**
 * Payment Routes Tests
 *
 * Tests for MCP server payment API endpoints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import type { Address, Hex } from 'viem';
import { submitUsdcPayment, checkFacilitatorHealth, getSupportedNetworks } from '../payment-routes.js';
import { createAndSignTransfer } from '../../payment/eip3009-signer.js';

// Mock facilitator client
vi.mock('../../payment/facilitator-client.js', () => ({
  getFacilitatorClient: vi.fn(() => ({
    healthCheck: vi.fn(),
    getSupportedNetworks: vi.fn(),
    verifyAndSettle: vi.fn(),
  })),
}));

describe('Payment Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    vi.clearAllMocks();
  });

  describe('POST /api/payment/usdc/submit', () => {
    const testPrivateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex;
    const testAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Address;
    const recipient = '0x742D35cC6634C0532925A3b844bc9E7595f0BEb8' as Address;

    it('should accept valid USDC.e payment submission', async () => {
      const authorization = await createAndSignTransfer(
        testAddress,
        recipient,
        '1',
        testPrivateKey,
        'cronos-testnet'
      );

      const { getFacilitatorClient } = await import('../../payment/facilitator-client.js');
      const mockFacilitator = (getFacilitatorClient as vi.MockedFunction<typeof getFacilitatorClient>)();
      (mockFacilitator.verifyAndSettle as vi.MockedFunction<any>).mockResolvedValueOnce({
        success: true,
        txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as Hex,
      });

      app.post('/api/payment/usdc/submit', submitUsdcPayment);

      const req = new Request('http://localhost/api/payment/usdc/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          network: 'cronos-testnet',
          authorization: {
            from: authorization.from,
            to: authorization.to,
            value: authorization.value.toString(),
            validAfter: authorization.validAfter.toString(),
            validBefore: authorization.validBefore.toString(),
            nonce: authorization.nonce,
            signature: authorization.signature,
          },
        }),
      });

      const res = await app.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.txHash).toBeDefined();
    });

    it('should reject invalid network', async () => {
      app.post('/api/payment/usdc/submit', submitUsdcPayment);

      const req = new Request('http://localhost/api/payment/usdc/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          network: 'ethereum', // Invalid network
          authorization: {
            from: testAddress,
            to: recipient,
            value: '1000000',
            validAfter: '0',
            validBefore: String(Math.floor(Date.now() / 1000) + 3600),
            nonce: '0x' + '0'.repeat(64),
            signature: '0x' + '0'.repeat(130),
          },
        }),
      });

      const res = await app.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Unsupported network');
    });

    it('should reject expired authorization', async () => {
      const authorization = await createAndSignTransfer(
        testAddress,
        recipient,
        '1',
        testPrivateKey,
        'cronos-testnet'
      );

      // Make authorization expired
      authorization.validBefore = BigInt(Math.floor(Date.now() / 1000) - 3600);

      app.post('/api/payment/usdc/submit', submitUsdcPayment);

      const req = new Request('http://localhost/api/payment/usdc/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          network: 'cronos-testnet',
          authorization: {
            from: authorization.from,
            to: authorization.to,
            value: authorization.value.toString(),
            validAfter: authorization.validAfter.toString(),
            validBefore: authorization.validBefore.toString(),
            nonce: authorization.nonce,
            signature: authorization.signature,
          },
        }),
      });

      const res = await app.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid authorization');
      expect(data.reason).toContain('expired');
    });

    it('should reject zero amount', async () => {
      const authorization = await createAndSignTransfer(
        testAddress,
        recipient,
        '1',
        testPrivateKey,
        'cronos-testnet'
      );

      authorization.value = 0n;

      app.post('/api/payment/usdc/submit', submitUsdcPayment);

      const req = new Request('http://localhost/api/payment/usdc/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          network: 'cronos-testnet',
          authorization: {
            from: authorization.from,
            to: authorization.to,
            value: authorization.value.toString(),
            validAfter: authorization.validAfter.toString(),
            validBefore: authorization.validBefore.toString(),
            nonce: authorization.nonce,
            signature: authorization.signature,
          },
        }),
      });

      const res = await app.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.reason).toContain('positive');
    });

    it('should reject transfer to self', async () => {
      const authorization = await createAndSignTransfer(
        testAddress,
        testAddress, // Same as sender
        '1',
        testPrivateKey,
        'cronos-testnet'
      );

      app.post('/api/payment/usdc/submit', submitUsdcPayment);

      const req = new Request('http://localhost/api/payment/usdc/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          network: 'cronos-testnet',
          authorization: {
            from: authorization.from,
            to: authorization.to,
            value: authorization.value.toString(),
            validAfter: authorization.validAfter.toString(),
            validBefore: authorization.validBefore.toString(),
            nonce: authorization.nonce,
            signature: authorization.signature,
          },
        }),
      });

      const res = await app.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.reason).toContain('self');
    });

    it('should handle facilitator settlement failure', async () => {
      const authorization = await createAndSignTransfer(
        testAddress,
        recipient,
        '1',
        testPrivateKey,
        'cronos-testnet'
      );

      const { getFacilitatorClient } = await import('../../payment/facilitator-client.js');
      const mockFacilitator = (getFacilitatorClient as vi.MockedFunction<typeof getFacilitatorClient>)();
      (mockFacilitator.verifyAndSettle as vi.MockedFunction<any>).mockResolvedValueOnce({
        success: false,
        error: 'Insufficient balance',
      });

      app.post('/api/payment/usdc/submit', submitUsdcPayment);

      const req = new Request('http://localhost/api/payment/usdc/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          network: 'cronos-testnet',
          authorization: {
            from: authorization.from,
            to: authorization.to,
            value: authorization.value.toString(),
            validAfter: authorization.validAfter.toString(),
            validBefore: authorization.validBefore.toString(),
            nonce: authorization.nonce,
            signature: authorization.signature,
          },
        }),
      });

      const res = await app.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Payment settlement failed');
    });

    it('should reject malformed request body', async () => {
      app.post('/api/payment/usdc/submit', submitUsdcPayment);

      const req = new Request('http://localhost/api/payment/usdc/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          network: 'cronos-testnet',
          // Missing authorization
        }),
      });

      const res = await app.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid request body');
    });
  });

  describe('GET /api/payment/facilitator/health', () => {
    it('should return healthy status', async () => {
      const { getFacilitatorClient } = await import('../../payment/facilitator-client.js');
      const mockFacilitator = (getFacilitatorClient as vi.MockedFunction<typeof getFacilitatorClient>)();
      (mockFacilitator.healthCheck as vi.MockedFunction<any>).mockResolvedValueOnce({
        status: 'healthy',
        timestamp: Date.now(),
      });

      app.get('/api/payment/facilitator/health', checkFacilitatorHealth);

      const req = new Request('http://localhost/api/payment/facilitator/health');
      const res = await app.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.healthy).toBe(true);
      expect(data.status).toBe('healthy');
    });

    it('should return unhealthy status on error', async () => {
      const { getFacilitatorClient } = await import('../../payment/facilitator-client.js');
      const mockFacilitator = (getFacilitatorClient as vi.MockedFunction<typeof getFacilitatorClient>)();
      (mockFacilitator.healthCheck as vi.MockedFunction<any>).mockRejectedValueOnce(
        new Error('Connection failed')
      );

      app.get('/api/payment/facilitator/health', checkFacilitatorHealth);

      const req = new Request('http://localhost/api/payment/facilitator/health');
      const res = await app.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(503);
      expect(data.healthy).toBe(false);
      expect(data.status).toBe('unhealthy');
    });
  });

  describe('GET /api/payment/facilitator/supported', () => {
    it('should return supported networks', async () => {
      const mockNetworks = {
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
        ],
      };

      const { getFacilitatorClient } = await import('../../payment/facilitator-client.js');
      const mockFacilitator = (getFacilitatorClient as vi.MockedFunction<typeof getFacilitatorClient>)();
      (mockFacilitator.getSupportedNetworks as vi.MockedFunction<any>).mockResolvedValueOnce(mockNetworks);

      app.get('/api/payment/facilitator/supported', getSupportedNetworks);

      const req = new Request('http://localhost/api/payment/facilitator/supported');
      const res = await app.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.networks).toHaveLength(1);
      expect(data.networks?.[0]?.network).toBe('cronos-mainnet');
    });

    it('should handle error fetching supported networks', async () => {
      const { getFacilitatorClient } = await import('../../payment/facilitator-client.js');
      const mockFacilitator = (getFacilitatorClient as vi.MockedFunction<typeof getFacilitatorClient>)();
      (mockFacilitator.getSupportedNetworks as vi.MockedFunction<any>).mockRejectedValueOnce(
        new Error('API error')
      );

      app.get('/api/payment/facilitator/supported', getSupportedNetworks);

      const req = new Request('http://localhost/api/payment/facilitator/supported');
      const res = await app.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error).toBeDefined();
    });
  });
});
