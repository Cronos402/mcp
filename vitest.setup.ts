/**
 * Vitest Setup
 *
 * Global test configuration and polyfills
 */

import { vi } from 'vitest';
import { webcrypto } from 'crypto';

// Polyfill crypto for Node.js test environment
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto as Crypto;
}

// Mock console methods to reduce test noise (keep error for debugging)
globalThis.console = {
  ...console,
  log: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: console.error, // Keep error for debugging
};
