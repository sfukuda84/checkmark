"use client";

import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import type { Auth } from "./auth";

export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [inferAdditionalFields<Auth>()],
});
