import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// NOTE: Intentionally public -- called from both client (auth-state.ts) and
// server (auth-session.ts) via Convex HTTP query API. The only data exposed is
// the role string ("free"/"pro") for a known userId. Auth-gating would require
// a Convex HTTP action with session header forwarding, deferred for now.

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
 * Using internalMutation so it cannot be called from any client SDK.
 */
export const setUserRole = internalMutation({
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
    } else {
      await ctx.db.insert("userRoles", {
        userId: args.userId,
        role: args.role,
      });
    }
    return { success: true };
  },
});
