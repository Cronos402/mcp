/**
 * Native CRO Payment Tests
 *
 * Tests for CRO transaction building and on-chain verification
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseUnits, type Address, type Hex } from 'viem';
import {
  buildCroTransaction,
  createCroPaymentRequirement,
  validateCroTransaction,
  verifyCroPayment,
  checkCroBalance,
} from '../cro-payment.js';
import { CRO_ADDRESS, CRO_METADATA, CRONOS_CHAIN_ID } from '../../cronos-constants.js';

describe('CRO Payment', () => {
  const sender = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Address;
  const recipient = '0x742D35cC6634C0532925A3b844bc9E7595f0BEb8' as Address;

  describe('buildCroTransaction', () => {
    it('should build valid CRO transaction', () => {
      const tx = buildCroTransaction(sender, recipient, '0.1', 'cronos-testnet');

      expect(tx.from).toBe(sender);
      expect(tx.to).toBe(recipient);
      expect(tx.value).toBe(parseUnits('0.1', 18)); // CRO has 18 decimals
      expect(tx.chainId).toBe(CRONOS_CHAIN_ID.TESTNET);
      expect(tx.gasLimit).toBe(21000n);
    });

    it('should handle different CRO amounts correctly', () => {
      const amounts = [
        { input: '0.1', expected: parseUnits('0.1', 18) },
        { input: '1', expected: parseUnits('1', 18) },
        { input: '100', expected: parseUnits('100', 18) },
        { input: '0.001', expected: parseUnits('0.001', 18) },
      ];

      for (const { input, expected } of amounts) {
        const tx = buildCroTransaction(sender, recipient, input, 'cronos-testnet');
        expect(tx.value).toBe(expected);
      }
    });

    it('should set correct chain ID for mainnet', () => {
      const tx = buildCroTransaction(sender, recipient, '1', 'cronos-mainnet');
      expect(tx.chainId).toBe(CRONOS_CHAIN_ID.MAINNET);
    });

    it('should set correct chain ID for testnet', () => {
      const tx = buildCroTransaction(sender, recipient, '1', 'cronos-testnet');
      expect(tx.chainId).toBe(CRONOS_CHAIN_ID.TESTNET);
    });
  });

  describe('createCroPaymentRequirement', () => {
    it('should create valid payment requirement', () => {
      const req = createCroPaymentRequirement(recipient, '0.1', 'cronos-testnet', 'Test payment');

      expect(req.type).toBe('crypto');
      expect(req.network).toBe('cronos-testnet');
      expect(req.token).toBe(CRO_ADDRESS);
      expect(req.symbol).toBe(CRO_METADATA.SYMBOL.TESTNET);
      expect(req.amount).toBe(parseUnits('0.1', 18).toString());
      expect(req.decimals).toBe(18);
      expect(req.recipient).toBe(recipient);
      expect(req.chainId).toBe(CRONOS_CHAIN_ID.TESTNET);
      expect(req.description).toBe('Test payment');
      expect(req.requiresSignature).toBe(true);
      expect(req.gasless).toBe(false);
    });

    it('should use correct symbol for mainnet', () => {
      const req = createCroPaymentRequirement(recipient, '1', 'cronos-mainnet');
      expect(req.symbol).toBe(CRO_METADATA.SYMBOL.MAINNET);
    });

    it('should use correct symbol for testnet', () => {
      const req = createCroPaymentRequirement(recipient, '1', 'cronos-testnet');
      expect(req.symbol).toBe(CRO_METADATA.SYMBOL.TESTNET);
    });

    it('should generate default description if not provided', () => {
      const req = createCroPaymentRequirement(recipient, '0.5', 'cronos-testnet');
      expect(req.description).toBe('Pay 0.5 TCRO');
    });
  });

  describe('validateCroTransaction', () => {
    it('should validate correct transaction', () => {
      const tx = buildCroTransaction(sender, recipient, '1', 'cronos-testnet');
      const result = validateCroTransaction(tx);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject zero amount', () => {
      const tx = buildCroTransaction(sender, recipient, '1', 'cronos-testnet');
      tx.value = 0n;

      const result = validateCroTransaction(tx);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Transfer amount must be positive');
    });

    it('should reject transfer to self', () => {
      const tx = buildCroTransaction(sender, sender, '1', 'cronos-testnet');

      const result = validateCroTransaction(tx);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Cannot transfer to self');
    });

    it('should reject transfer to zero address', () => {
      const tx = buildCroTransaction(sender, CRO_ADDRESS, '1', 'cronos-testnet');

      const result = validateCroTransaction(tx);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Cannot transfer to zero address');
    });
  });

  describe('verifyCroPayment', () => {
    // Note: These are mock tests. Real on-chain verification would require
    // actual transactions on testnet, which should be done in integration tests.

    it('should have correct function signature', () => {
      expect(typeof verifyCroPayment).toBe('function');
      // Function takes 5 params, but minConfirmations has a default value
      expect(verifyCroPayment).toHaveLength(4);
    });

    it('should return promise', () => {
      const mockTxHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as Hex;
      const result = verifyCroPayment(
        mockTxHash,
        recipient,
        '0.1',
        'cronos-testnet'
      );

      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe('checkCroBalance', () => {
    it('should have correct function signature', () => {
      expect(typeof checkCroBalance).toBe('function');
      expect(checkCroBalance).toHaveLength(3);
    });

    it('should return promise', () => {
      const result = checkCroBalance(sender, '0.1', 'cronos-testnet');
      expect(result).toBeInstanceOf(Promise);
    });
  });
});
