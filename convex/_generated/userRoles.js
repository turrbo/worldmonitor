import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
/**
 * Get the role for a user. Returns "free" if no role row exists.
 * This is the fallback approach for role management when the
 * better-auth additionalFields.role is not reflected by the Convex adapter.
 */
export const getUserRole = query({
    args: { userId: v.string() },
    handler: async (ctx, args) => {
        const row = await ctx.db
            .query("userRoles")
            .withIndex("by_userId", (q) => q.eq("userId", args.userId))
            .unique();
        return { role: row?.role ?? "free" };
    },
});
/**
 * Set (upsert) the role for a user. Admin-only in practice --
 * called from Convex dashboard or admin scripts, not from the client.
 */
export const setUserRole = mutation({
    args: {
        userId: v.string(),
        role: v.string(),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("userRoles")
            .withIndex("by_userId", (q) => q.eq("userId", args.userId))
            .unique();
        if (existing) {
            await ctx.db.patch(existing._id, { role: args.role });
        }
        else {
            await ctx.db.insert("userRoles", {
                userId: args.userId,
                role: args.role,
            });
        }
        return { success: true };
    },
});
