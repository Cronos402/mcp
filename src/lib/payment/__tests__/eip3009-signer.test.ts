/**
 * EIP-3009 Signer Tests
 *
 * Tests for USDC.e transferWithAuthorization signature generation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { parseUnits, type Address, type Hex } from 'viem';
import {
  generateNonce,
  createTransferAuthorization,
  signTransferAuthorization,
  createAndSignTransfer,
  validateTransferAuthorization,
} from '../eip3009-signer.js';

describe('EIP-3009 Signer', () => {
  describe('generateNonce', () => {
    it('should generate a 32-byte hex nonce', () => {
      const nonce = generateNonce();

      // Should be 0x + 64 hex chars = 32 bytes
      expect(nonce).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('should generate unique nonces', () => {
      const nonce1 = generateNonce();
      const nonce2 = generateNonce();

      expect(nonce1).not.toBe(nonce2);
    });

    it('should include timestamp in first 8 bytes', () => {
      const before = Date.now();
      const nonce = generateNonce();
      const after = Date.now();

      // Extract timestamp from first 16 hex chars (8 bytes)
      const timestampHex = nonce.slice(2, 18);
      const timestamp = parseInt(timestampHex, 16);

      // Timestamp should be within test execution window
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after + 1000); // +1s buffer
    });
  });

  describe('createTransferAuthorization', () => {
    const from = '0x742D35cC6634C0532925A3b844bc9E7595f0BEb8' as Address;
    const to = '0x1234567890123456789012345678901234567890' as Address;

    it('should create valid authorization with correct amount', () => {
      const auth = createTransferAuthorization(from, to, '0.01');

      expect(auth.from).toBe(from);
      expect(auth.to).toBe(to);
      expect(auth.value).toBe(parseUnits('0.01', 6)); // 10000 (6 decimals)
      expect(auth.validAfter).toBe(0n);
      expect(auth.nonce).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('should handle different USDC amounts correctly', () => {
      const amounts = [
        { input: '0.01', expected: 10000n },
        { input: '1', expected: 1000000n },
        { input: '100', expected: 100000000n },
        { input: '0.001', expected: 1000n },
      ];

      for (const { input, expected } of amounts) {
        const auth = createTransferAuthorization(from, to, input);
        expect(auth.value).toBe(expected);
      }
    });

    it('should set validBefore to 1 hour by default', () => {
      const before = Math.floor(Date.now() / 1000);
      const auth = createTransferAuthorization(from, to, '1');
      const after = Math.floor(Date.now() / 1000);

      const expectedValidBefore = BigInt(before + 3600);
      const actualValidBefore = auth.validBefore;

      // Should be around current time + 1 hour (within 2 seconds tolerance)
      expect(actualValidBefore).toBeGreaterThanOrEqual(expectedValidBefore);
      expect(actualValidBefore).toBeLessThanOrEqual(expectedValidBefore + 2n);
    });

    it('should accept custom validity window', () => {
      const customWindow = 1800; // 30 minutes
      const before = Math.floor(Date.now() / 1000);
      const auth = createTransferAuthorization(from, to, '1', customWindow);

      const expectedValidBefore = BigInt(before + customWindow);
      expect(auth.validBefore).toBeGreaterThanOrEqual(expectedValidBefore);
      expect(auth.validBefore).toBeLessThanOrEqual(expectedValidBefore + 2n);
    });

    it('should set validAfter to 0 (valid immediately)', () => {
      const auth = createTransferAuthorization(from, to, '1');
      expect(auth.validAfter).toBe(0n);
    });
  });

  describe('signTransferAuthorization', () => {
    // Test private key (DO NOT use in production!)
    const testPrivateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex;
    const testAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Address;
    const recipient = '0x742D35cC6634C0532925A3b844bc9E7595f0BEb8' as Address;

    it('should sign authorization with valid signature', async () => {
      const auth = createTransferAuthorization(testAddress, recipient, '1');

      const signed = await signTransferAuthorization(
        auth,
        testPrivateKey,
        'cronos-testnet'
      );

      expect(signed.signature).toMatch(/^0x[0-9a-f]{130}$/); // 65 bytes
      expect(signed.from).toBe(auth.from);
      expect(signed.to).toBe(auth.to);
      expect(signed.value).toBe(auth.value);
    });

    it('should produce different signatures for different authorizations', async () => {
      const auth1 = createTransferAuthorization(testAddress, recipient, '1');
      const auth2 = createTransferAuthorization(testAddress, recipient, '2');

      const signed1 = await signTransferAuthorization(auth1, testPrivateKey, 'cronos-testnet');
      const signed2 = await signTransferAuthorization(auth2, testPrivateKey, 'cronos-testnet');

      expect(signed1.signature).not.toBe(signed2.signature);
    });

    it('should work with both mainnet and testnet', async () => {
      const auth = createTransferAuthorization(testAddress, recipient, '1');

      const signedTestnet = await signTransferAuthorization(auth, testPrivateKey, 'cronos-testnet');
      const signedMainnet = await signTransferAuthorization(auth, testPrivateKey, 'cronos-mainnet');

      expect(signedTestnet.signature).toMatch(/^0x[0-9a-f]{130}$/);
      expect(signedMainnet.signature).toMatch(/^0x[0-9a-f]{130}$/);
      // Signatures should differ due to different chainIds in domain
      expect(signedTestnet.signature).not.toBe(signedMainnet.signature);
    });
  });

  describe('createAndSignTransfer', () => {
    const testPrivateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex;
    const testAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Address;
    const recipient = '0x742D35cC6634C0532925A3b844bc9E7595f0BEb8' as Address;

    it('should create and sign in one step', async () => {
      const signed = await createAndSignTransfer(
        testAddress,
        recipient,
        '0.5',
        testPrivateKey,
        'cronos-testnet'
      );

      expect(signed.from).toBe(testAddress);
      expect(signed.to).toBe(recipient);
      expect(signed.value).toBe(parseUnits('0.5', 6));
      expect(signed.signature).toMatch(/^0x[0-9a-f]{130}$/);
    });

    it('should accept custom validity window', async () => {
      const customWindow = 7200; // 2 hours
      const before = Math.floor(Date.now() / 1000);

      const signed = await createAndSignTransfer(
        testAddress,
        recipient,
        '1',
        testPrivateKey,
        'cronos-testnet',
        customWindow
      );

      const expectedValidBefore = BigInt(before + customWindow);
      expect(signed.validBefore).toBeGreaterThanOrEqual(expectedValidBefore);
    });
  });

  describe('validateTransferAuthorization', () => {
    const from = '0x742D35cC6634C0532925A3b844bc9E7595f0BEb8' as Address;
    const to = '0x1234567890123456789012345678901234567890' as Address;

    it('should validate correct authorization', () => {
      const auth = createTransferAuthorization(from, to, '1');
      const result = validateTransferAuthorization(auth);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject zero amount', () => {
      const auth = createTransferAuthorization(from, to, '1');
      auth.value = 0n;

      const result = validateTransferAuthorization(auth);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Transfer amount must be positive');
    });

    it('should reject negative amount', () => {
      const auth = createTransferAuthorization(from, to, '1');
      auth.value = -100n;

      const result = validateTransferAuthorization(auth);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Transfer amount must be positive');
    });

    it('should reject transfer to self', () => {
      const auth = createTransferAuthorization(from, from, '1');

      const result = validateTransferAuthorization(auth);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Cannot transfer to self');
    });

    it('should reject expired authorization', () => {
      const auth = createTransferAuthorization(from, to, '1');
      // Set validBefore to past timestamp
      auth.validBefore = BigInt(Math.floor(Date.now() / 1000) - 3600);

      const result = validateTransferAuthorization(auth);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Authorization has expired');
    });

    it('should reject not-yet-valid authorization', () => {
      const auth = createTransferAuthorization(from, to, '1');
      // Set validAfter to future timestamp
      auth.validAfter = BigInt(Math.floor(Date.now() / 1000) + 3600);

      const result = validateTransferAuthorization(auth);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Authorization not yet valid');
    });

    it('should reject invalid nonce format', () => {
      const auth = createTransferAuthorization(from, to, '1');
      auth.nonce = '0x123' as Hex; // Too short

      const result = validateTransferAuthorization(auth);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid nonce format');
    });
  });
});
