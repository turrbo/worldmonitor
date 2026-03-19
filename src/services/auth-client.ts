import { createAuthClient } from "better-auth/client";
import {
  convexClient,
  crossDomainClient,
} from "@convex-dev/better-auth/client/plugins";
import { adminClient } from "better-auth/client/plugins";
import { organizationClient } from "better-auth/client/plugins";
import { dashClient } from "@better-auth/infra/client";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_CONVEX_SITE_URL,
  plugins: [
    crossDomainClient(),
    convexClient(),
    adminClient(),
    organizationClient(),
    dashClient(),
  ],
});
