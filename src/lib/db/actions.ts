import { and, desc, eq } from "drizzle-orm";
import * as schema from "../../../auth-schema.js";
import { userWallets } from "../../../auth-schema.js";
import { db } from "../auth.js";
import { randomUUID } from "node:crypto";

export type Wallet = Omit<typeof userWallets.$inferSelect, 'walletMetadata'> & { walletMetadata: unknown }

// Wallet operations for Cronos402
// Users connect their own external wallets (MetaMask, Crypto.com Wallet, etc.)
export const txOperations = {
  // List active wallets for a user
  getWalletsByUser: async (userId: string) => {
    const rows = await db
      .select()
      .from(schema.userWallets)
      .where(
        and(
          eq(schema.userWallets.userId as any, userId) as any,
          eq(schema.userWallets.isActive as any, true) as any,
        ) as any
      )
      .orderBy(
        desc(schema.userWallets.isPrimary as any) as any,
        desc(schema.userWallets.createdAt as any) as any,
      );

    return rows as unknown as Wallet[];
  },

  // Check if user has any active wallets
  userHasWallets: async (userId: string) => {
    const rows = await db
      .select({ id: schema.userWallets.id })
      .from(schema.userWallets)
      .where(
        and(
          eq(schema.userWallets.userId, userId),
          eq(schema.userWallets.isActive, true),
        )
      )
      .limit(1);
    return rows.length > 0;
  },

  // Create an external wallet record for a user (after signature verification)
  createExternalWallet: (
    userId: string,
    data: {
      walletAddress: string;
      provider: string;
      blockchain: string;
      chainId?: number;
      isPrimary?: boolean;
    }
  ) => async () => {
    const walletMetadata = {
      provider: data.provider,
      type: "external",
      chainId: data.chainId,
      linkedAt: new Date().toISOString(),
    } as Record<string, unknown>;

    const inserted = await db
      .insert(schema.userWallets)
      .values({
        id: randomUUID(),
        userId,
        walletAddress: data.walletAddress,
        walletType: "external",
        provider: data.provider,
        blockchain: data.blockchain,
        architecture: "evm",
        isPrimary: data.isPrimary ?? false,
        isActive: true,
        walletMetadata: walletMetadata as any,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    const row = inserted?.[0];
    if (!row) return null;

    return { ...row, walletMetadata } as Wallet;
  },

  // Find wallet by address
  getWalletByAddress: (walletAddress: string) => async () => {
    const rows = await db
      .select()
      .from(schema.userWallets)
      .where(
        and(
          eq(schema.userWallets.walletAddress as any, walletAddress) as any,
          eq(schema.userWallets.isActive as any, true) as any,
        ) as any
      )
      .limit(1);

    const row = rows?.[0];
    if (!row) return null;

    return row as unknown as Wallet;
  },
};
