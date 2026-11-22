import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { serverLog, newRequestId } from "./lib/server-logger";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    serverLog.error("Server error in route handler", {
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    });
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

// requestMiddleware runs on every request; functionMiddleware only on server functions.
// No Supabase Auth bearer token is attached — local auth uses app_session + auth.uid().
export const startInstance = createStart(() => ({
  functionMiddleware: [],
  requestMiddleware: [errorMiddleware, csrfMiddleware],
}));
