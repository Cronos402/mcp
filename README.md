![Cronos402 Logo](https://raw.githubusercontent.com/Cronos402/assets/main/Cronos402-logo-light.svg)

# Cronos402 MCP Server

Core Model Context Protocol (MCP) server with authentication and x402 payment validation for Cronos blockchain.

Production URL: https://mcp.cronos402.dev

## Overview

The Cronos402 MCP Server is the central service providing authenticated access to MCP tools with integrated payment validation. It combines Better Auth for user management with x402 payment protocol for monetizing tool access. Developers can register, generate API keys, and consume tools while the server handles payment verification and blockchain integration.

## Architecture

- **Framework**: Express.js with TypeScript
- **Authentication**: Better Auth with session management
- **Database**: Drizzle ORM with PostgreSQL
- **Payment**: x402 protocol with Cronos facilitator integration
- **Protocol**: Model Context Protocol (MCP) via HTTP transport
- **Blockchain**: Cronos testnet and mainnet support

## Features

- User authentication and session management
- API key generation and management
- x402 payment-gated tool execution
- USDC.e gasless payments via Cronos facilitator (EIP-3009)
- Native CRO direct payment support
- Automatic payment verification and settlement
- Tool usage analytics and tracking
- Compatible with Claude Desktop, Cursor, and other MCP clients
- RESTful API for server management

## Quick Start

### Development

```bash
pnpm install
pnpm dev
```

Server runs on `http://localhost:3005`

### Build

```bash
pnpm build
pnpm start
```

### Environment Variables

```env
DATABASE_URL=postgresql://user:password@localhost:5432/cronos402
BETTER_AUTH_SECRET=your-secret-key
BETTER_AUTH_URL=http://localhost:3005

# Cronos Network
CRONOS_NETWORK=cronos-testnet
RECIPIENT_ADDRESS=0xYourAddress

# Facilitator
FACILITATOR_URL=https://facilitator.cronoslabs.org/v2/x402
```

## API Endpoints

### Authentication

#### POST /api/auth/register
Register a new user account.

```json
{
  "email": "user@example.com",
  "password": "secure_password",
  "name": "User Name"
}
```

#### POST /api/auth/login
Authenticate and create session.

```json
{
  "email": "user@example.com",
  "password": "secure_password"
}
```

#### POST /api/auth/logout
End current session.

### API Key Management

#### GET /api/keys
List all API keys for authenticated user.

#### POST /api/keys
Generate new API key.

```json
{
  "name": "My API Key",
  "permissions": ["tools:call"]
}
```

#### DELETE /api/keys/:keyId
Revoke API key.

### MCP Protocol

#### POST /mcp
MCP protocol endpoint for tool calls and server operations.

Supports standard MCP operations:
- `initialize` - Initialize MCP connection
- `listTools` - List available tools
- `callTool` - Execute tool (requires payment)
- `listResources` - List available resources

Example tool call with payment:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "callTool",
  "params": {
    "name": "get_weather",
    "arguments": {
      "city": "Tokyo"
    },
    "_meta": {
      "x402/payment": {
        "type": "transfer_with_authorization",
        "signature": "0x...",
        "from": "0x...",
        "validBefore": 1234567890
      }
    }
  }
}
```

## Integration Examples

### Claude Desktop Configuration

```json
{
  "mcpServers": {
    "Cronos402": {
      "command": "npx",
      "args": [
        "cronos402",
        "connect",
        "--urls",
        "https://mcp.cronos402.dev/mcp",
        "--api-key",
        "your_api_key_here"
      ]
    }
  }
}
```

### Programmatic Access

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { withX402Client } from 'cronos402/client';
import { createSigner } from 'x402/types';

const cronosSigner = await createSigner('cronos-testnet', '0x...');
const transport = new StreamableHTTPClientTransport(
  new URL('https://mcp.cronos402.dev/mcp')
);

const client = new Client(
  { name: 'my-app', version: '1.0.0' },
  { capabilities: {} }
);

await client.connect(transport);

const paymentClient = withX402Client(client, {
  wallet: { evm: cronosSigner },
  maxPaymentValue: BigInt(1000000)
});

const result = await paymentClient.callTool({
  name: 'premium_tool',
  arguments: { query: 'data' }
});
```

## Payment Validation Flow

1. Client sends tool call request
2. Server checks for payment in `_meta['x402/payment']`
3. If no payment:
   - Return 402 Payment Required with payment details
   - Include price, recipient address, and facilitator URL
4. If payment provided:
   - Verify signature and authorization
   - Check payment amount matches price
   - Call facilitator `/verify` endpoint
   - Execute tool if verification succeeds
5. Facilitator settles payment on-chain (gasless for USDC.e)

## Testing

```bash
# Run all tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage report
pnpm test:coverage
```

## Database Schema

The server uses Drizzle ORM with the following core tables:

- `users` - User accounts and authentication
- `sessions` - Active user sessions
- `api_keys` - API key management
- `tool_calls` - Tool usage tracking
- `payments` - Payment transaction records

### Migrations

```bash
# Generate migration
pnpm drizzle-kit generate

# Run migrations
pnpm drizzle-kit migrate

# Studio (database UI)
pnpm drizzle-kit studio
```

## Deployment

### Production Build

```bash
pnpm build
NODE_ENV=production pnpm start
```

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
EXPOSE 3005
CMD ["pnpm", "start"]
```

### Environment Configuration

Production environment requires:
- PostgreSQL database
- HTTPS endpoint
- Secure auth secret
- Valid recipient address
- Facilitator access

## Monitoring

The server provides health check and metrics endpoints:

- `GET /health` - Server health status
- `GET /metrics` - Prometheus-compatible metrics

## Security

- API keys are hashed before storage
- Sessions use secure HTTP-only cookies
- Payment signatures verified on-chain
- Rate limiting on tool calls
- Input validation on all endpoints

## Resources

- Documentation: https://docs.cronos402.dev
- SDK: https://github.com/Cronos402/sdk
- GitHub: https://github.com/Cronos402/mcp

## License

MIT
