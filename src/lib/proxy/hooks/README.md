# Proxy Hooks

This directory contains hooks that can be used with the Cronos402 proxy system to modify requests and responses.

## Available Hooks

### SecurityHook
Removes sensitive headers from requests before forwarding them to upstream servers.

**Features:**
- Removes authorization tokens, API keys, cookies, and other sensitive headers
- Prevents accidental exposure of credentials

**Usage:**
```typescript
import { SecurityHook } from "./hooks/security-hook.js";

const hooks = [
  new SecurityHook(),
];
```

### X402WalletHook
Handles X402 payment requirements by automatically signing payments when possible.

**Features:**
- Detects payment requirements in responses
- Automatically signs payments for authenticated users
- Provides funding links for insufficient funds errors
- Generates onramp URLs for quick wallet funding

**Usage:**
```typescript
import { X402WalletHook } from "./hooks/x402-wallet-hook.js";

const hooks = [
  new X402WalletHook(session),
];
```

## Hook Interface

All hooks implement the `Hook` interface from `cronos402/handler`:

```typescript
interface Hook {
  name: string;
  
  // Optional: Modify request before sending to upstream
  processCallToolRequest?(req: CallToolRequest, extra: RequestExtra): Promise<{
    resultType: "continue";
    request: CallToolRequest;
  }>;

  // Optional: Modify response after receiving from upstream
  processCallToolResult?(res: CallToolResult, req: CallToolRequest, extra: RequestExtra): Promise<ToolCallResponseHookResult>;

  // Optional: Modify headers before sending to upstream
  prepareUpstreamHeaders?(headers: Headers, req: CallToolRequest, extra: RequestExtra): Promise<void>;
}
```

## Adding New Hooks

To create a new hook:

1. Create a new file in this directory (e.g., `my-hook.ts`)
2. Implement the `Hook` interface
3. Import and use in `index.ts`:

```typescript
import { MyHook } from "./lib/proxy/hooks/my-hook.js";

const hooks = [
  new MyHook(config),
];
```

## Hook Execution Order

Hooks are executed in the order they appear in the array:

1. **Request Phase**: `processCallToolRequest` → `prepareUpstreamHeaders`
2. **Response Phase**: `processCallToolResult`

The current order in the main application is:
1. `AnalyticsHook` - Tracks requests for analytics
2. `LoggingHook` - Logs request/response details
3. `X402WalletHook` - Handles payment requirements
4. `SecurityHook` - Removes sensitive headers

## Best Practices

- **Order matters**: Place security-related hooks (like `SecurityHook`) after other hooks that might need access to sensitive data
- **Error handling**: Always wrap hook logic in try-catch blocks to prevent breaking the proxy
- **Performance**: Keep hook operations lightweight to avoid slowing down requests
- **Logging**: Use consistent logging patterns with hook names as prefixes
- **Configuration**: Make hooks configurable through constructor parameters
