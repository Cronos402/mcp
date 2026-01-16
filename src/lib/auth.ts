import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { apiKey, mcp } from "better-auth/plugins";
import dotenv from "dotenv";
import { drizzle as drizzleNeon, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { neon, neonConfig } from "@neondatabase/serverless";
import postgres from "postgres";
import * as schema from "../../auth-schema.js";
import env, { getDatabaseUrl, getTrustedOrigins } from "../env.js";

dotenv.config();

const TRUSTED_ORIGINS = getTrustedOrigins();

// Determine if we're using Neon or local PostgreSQL
const databaseUrl = getDatabaseUrl();
const isNeonDb = databaseUrl.includes('neon.tech') || databaseUrl.includes('neon.database');

// Type that preserves schema inference for both database types
type DbType = NeonHttpDatabase<typeof schema> | PostgresJsDatabase<typeof schema>;

let db: DbType;

if (isNeonDb) {
  // Use Neon HTTP driver for Neon databases
  neonConfig.fetchConnectionCache = true;
  const sql = neon(databaseUrl);
  db = drizzleNeon(sql, { schema });
} else {
  // Use regular postgres driver for local/Docker PostgreSQL
  const client = postgres(databaseUrl);
  db = drizzlePostgres(client, { schema });
}

export { db };

const crossDomainConfig = () => {
  const isDevelopment = env.NODE_ENV === "development" || env.NODE_ENV === "test";
  if (isDevelopment) {
    return {
      crossSubDomainCookies: {
        enabled: true,
        domain: ".localhost"
      },
    }
  }
  return {
    crossSubDomainCookies: {
      enabled: true,
      domain: ".cronos402.tech"
    },
  }
}

export const auth = betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    database: drizzleAdapter(db, {
        provider: "pg"
    }),
    trustedOrigins: TRUSTED_ORIGINS,
    emailAndPassword: {
        enabled: true,
    },
    socialProviders: {
        github: {
          clientId: env.GITHUB_CLIENT_ID,
          clientSecret: env.GITHUB_CLIENT_SECRET,
        },
        google: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
        }
    },
      advanced: {
        ...crossDomainConfig(),
        useSecureCookies: true
    },
    plugins: [
        apiKey({
            enableSessionForAPIKeys: true,
            enableMetadata: true,
            rateLimit: {
                enabled: false,
            }
        }),
        mcp({
            loginPage: "/connect",
        })
    ],
    hooks: {
        after: createAuthMiddleware(async (ctx) => {
          const newSession = ctx.context.newSession;

          // Only proceed if we have a new session (successful authentication)
          if (!newSession?.user?.id) {
            return;
          }

          const user = newSession.user;
          console.log(`[AUTH] User ${user.id} authenticated successfully (${user.email})`);
          // Cronos402: Users connect their own wallets (MetaMask, Crypto.com Wallet, etc.)
          // No auto wallet creation needed
        }),
      },
})