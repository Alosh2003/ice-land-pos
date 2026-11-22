// ICE LAND local backend — health check endpoints
// Simple health routes for load balancers and monitoring.

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/healthz")({
  ssr: false,
  component: () => {
    return (
      <script>
        {`document.write('{"status":"ok","app":true}')`}
      </script>
    );
  },
});
