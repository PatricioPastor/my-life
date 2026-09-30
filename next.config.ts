import type { NextConfig } from "next";
import { SECURITY_HEADERS } from "./src/shared/site/security-headers";

const nextConfig: NextConfig = {
  reactCompiler: true,
  async headers() {
    return [{ source: "/:path*", headers: [...SECURITY_HEADERS] }];
  },
};

export default nextConfig;
