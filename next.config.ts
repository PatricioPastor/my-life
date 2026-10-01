import type { NextConfig } from "next";
import { SECURITY_HEADERS } from "./src/shared/site/security-headers";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // "/" reads its story with fs. Server Actions that set cookies (the gate's session) re-render the page at request
  // time, so the Markdown must ship inside the serverless function, not only exist at build.
  outputFileTracingIncludes: {
    "/": ["./content/**/*.md"],
  },
  async headers() {
    return [{ source: "/:path*", headers: [...SECURITY_HEADERS] }];
  },
};

export default nextConfig;
