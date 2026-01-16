# Testing Guide for Cronos402 MCP

Comprehensive testing guide for the USDC.e payment system.

## Overview

The test suite covers the complete payment flow:

1. **EIP-3009 Signer** - Signature generation and validation
2. **Facilitator Client** - API communication with Cronos facilitator
3. **Payment Routes** - MCP server endpoints
4. **Integration Tests** - End-to-end payment flows

## Quick Start

### Install Dependencies

```bash
npm install
```

### Run All Tests

```bash
npm test
```

### Run Tests in Watch Mode

```bash
npm run test:watch
```

### Run Tests with Coverage

```bash
npm run test:coverage
```

## Test Structure

```
apps/mcp/src/
├── lib/
│   ├── payment/
│   │   ├── __tests__/
│   │   │   ├── eip3009-signer.test.ts          # EIP-3009 signing tests
│   │   │   └── facilitator-client.test.ts      # Facilitator API tests
│   │   ├── eip3009-signer.ts
│   │   └── facilitator-client.ts
│   └── api/
│       ├── __tests__/
│       │   └── payment-routes.test.ts           # API endpoint tests
│       └── payment-routes.ts
├── jest.config.js                               # Jest configuration
└── jest.setup.js                                # Test setup and polyfills
```

## Test Coverage

### EIP-3009 Signer Tests (30+ test cases)

**File:** `src/lib/payment/__tests__/eip3009-signer.test.ts`

**Tests:**
- ✅ Nonce generation (uniqueness, format, timestamp)
- ✅ Authorization creation (amounts, validity windows)
- ✅ USDC.e decimal precision (6 decimals)
- ✅ EIP-712 signature generation
- ✅ Authorization validation (expiry, amounts, self-transfers)
- ✅ Network compatibility (mainnet/testnet)

**Example:**
```bash
npm test eip3009-signer
```

### Facilitator Client Tests (20+ test cases)

**File:** `src/lib/payment/__tests__/facilitator-client.test.ts`

**Tests:**
- ✅ Health check endpoint
- ✅ Supported networks query
- ✅ Payment verification
- ✅ Payment settlement
- ✅ Combined verify + settle
- ✅ Error handling (timeouts, HTTP errors, network errors)
- ✅ Singleton pattern

**Example:**
```bash
npm test facilitator-client
```

### Payment Routes Tests (15+ test cases)

**File:** `src/lib/api/__tests__/payment-routes.test.ts`

**Tests:**
- ✅ Valid payment submission
- ✅ Network validation (rejects non-Cronos)
- ✅ Authorization validation (expired, zero amount, self-transfer)
- ✅ Facilitator error handling
- ✅ Health check endpoint
- ✅ Supported networks endpoint
- ✅ Malformed request handling

**Example:**
```bash
npm test payment-routes
```

## Running Specific Tests

### Run Single Test File

```bash
npm test -- eip3009-signer.test.ts
```

### Run Tests Matching Pattern

```bash
npm test -- --testNamePattern="nonce"
```

### Run Tests for Specific Module

```bash
npm test -- --testPathPattern="payment"
```

## Test Configuration

### Jest Config (`jest.config.js`)

```javascript
{
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  coverageThresholds: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
}
```

### Coverage Thresholds

- **Branches:** 70%
- **Functions:** 70%
- **Lines:** 70%
- **Statements:** 70%

## Writing New Tests

### Test Template

```typescript
import { describe, it, expect, beforeEach } from '@jest/globals';

describe('Feature Name', () => {
  beforeEach(() => {
    // Setup before each test
  });

  describe('Function Name', () => {
    it('should do something correctly', () => {
      // Arrange
      const input = 'test';

      // Act
      const result = functionUnderTest(input);

      // Assert
      expect(result).toBe('expected');
    });

    it('should handle errors gracefully', () => {
      // Test error cases
    });
  });
});
```

### Best Practices

1. **Use descriptive test names**
   ```typescript
   // Good
   it('should generate unique nonces with 32-byte hex format')

   // Bad
   it('test nonce')
   ```

2. **Test edge cases**
   - Zero/negative values
   - Empty strings
   - Null/undefined
   - Maximum values
   - Expired data

3. **Mock external dependencies**
   ```typescript
   jest.mock('../facilitator-client.js', () => ({
     getFacilitatorClient: jest.fn(() => ({
       healthCheck: jest.fn(),
     })),
   }));
   ```

4. **Clean up after tests**
   ```typescript
   beforeEach(() => {
     jest.clearAllMocks();
   });
   ```

5. **Test both success and failure paths**
   ```typescript
   it('should succeed with valid input', () => { /* ... */ });
   it('should fail with invalid input', () => { /* ... */ });
   ```

## Integration Testing

### Testnet Integration Tests

**Prerequisites:**
1. Cronos testnet access
2. Test wallet with TCRO and devUSDC.e
3. Environment variables configured

**Setup:**
```bash
# Get test tokens
# TCRO: https://cronos.org/faucet
# devUSDC.e: https://faucet.cronos.org

# Set environment variables
export CRONOS_FACILITATOR_URL="https://facilitator.cronoslabs.org/v2/x402"
export CRONOS_DEFAULT_NETWORK="cronos-testnet"
```

**Run Integration Tests:**
```bash
npm test -- --testPathPattern="integration"
```

### Manual Testing Flow

1. **Start MCP server:**
   ```bash
   npm run dev
   ```

2. **Test health endpoint:**
   ```bash
   curl http://localhost:3050/api/payment/facilitator/health
   ```

3. **Sign payment (use client app):**
   ```typescript
   const { signPermit } = useSignUsdcPermit();
   const signed = await signPermit({
     recipient: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb8',
     amount: '0.01',
   });
   ```

4. **Submit to MCP server:**
   ```bash
   curl -X POST http://localhost:3050/api/payment/usdc/submit \
     -H "Content-Type: application/json" \
     -d '{
       "network": "cronos-testnet",
       "authorization": { ... }
     }'
   ```

5. **Verify on Cronoscan:**
   ```
   https://testnet.cronoscan.com/tx/0x...
   ```

## Debugging Tests

### Enable Verbose Output

```bash
npm test -- --verbose
```

### Debug Single Test

```bash
node --inspect-brk node_modules/.bin/jest --runInBand eip3009-signer.test.ts
```

### View Console Logs

```typescript
// In test file, temporarily enable console
beforeEach(() => {
  global.console.log = console.log; // Restore original
});
```

### Check Coverage Report

```bash
npm run test:coverage
open coverage/lcov-report/index.html
```

## Common Issues

### Issue: "Cannot use import statement outside a module"

**Solution:** Ensure `jest.config.js` has correct ESM configuration:
```javascript
{
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
}
```

### Issue: "crypto is not defined"

**Solution:** Add crypto polyfill in `jest.setup.js`:
```javascript
import { webcrypto } from 'crypto';
global.crypto = webcrypto;
```

### Issue: "Module not found: Cannot resolve '.js' extension"

**Solution:** Add module name mapper in `jest.config.js`:
```javascript
{
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
}
```

### Issue: Tests timeout

**Solution:** Increase jest timeout:
```typescript
jest.setTimeout(30000); // 30 seconds
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm install
      - run: npm test
      - run: npm run test:coverage
      - uses: codecov/codecov-action@v3
```

## Test Maintenance

### Update Test Snapshots

```bash
npm test -- -u
```

### Clean Test Cache

```bash
jest --clearCache
```

### Run Tests Without Cache

```bash
npm test -- --no-cache
```

## Performance Testing

### Measure Test Performance

```bash
npm test -- --verbose --maxWorkers=1
```

### Profile Tests

```bash
node --prof node_modules/.bin/jest
```

## Security Testing

### Test Private Key Handling

- ✅ Never log private keys
- ✅ Use test keys only (never production)
- ✅ Validate signature generation
- ✅ Test authorization expiry

### Test Input Validation

- ✅ Reject malformed addresses
- ✅ Reject invalid amounts (zero, negative)
- ✅ Reject expired authorizations
- ✅ Validate nonce format

## Next Steps

After tests pass:

1. **Deploy to Testnet:**
   - Test with real faucet tokens
   - Verify transactions on Cronoscan
   - Monitor facilitator health

2. **Deploy to Mainnet:**
   - Use production USDC.e address
   - Test with small amounts first
   - Monitor transaction success rate

3. **Performance Testing:**
   - Load test facilitator endpoints
   - Measure signature generation time
   - Test concurrent payment submissions

4. **Security Audit:**
   - Review authorization validation
   - Test nonce uniqueness enforcement
   - Verify signature verification

## Resources

- **Jest Documentation:** https://jestjs.io/
- **ts-jest:** https://kulshekhar.github.io/ts-jest/
- **Cronos Facilitator Docs:** https://docs.cronos.org/cronos-x402-facilitator
- **Testing Best Practices:** https://kentcdodds.com/blog/common-mistakes-with-react-testing-library

## Support

For test failures or questions:
1. Check this guide first
2. Review test output and error messages
3. Check GitHub issues: https://github.com/your-repo/cronos402/issues
4. Ask in Discord: https://discord.com/invite/cronos
