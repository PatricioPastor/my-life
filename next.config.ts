import type { NextConfig } from "next";
import { SECURITY_HEADERS } from "./src/shared/site/security-headers";

// The case studies, read by "/" (Proyectos) and by the public work galaxy at /trabajo.
const PROJECTS_CONTENT = "./content/projects/**/*.md";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // "/" reads its story and the case studies (content/projects) with fs. Server Actions that set cookies (the gate's
  // session) re-render the page at request time, so the Markdown must ship inside the serverless function, not only
  // exist at build. Any other route that reads content needs the same include: /trabajo and its deep links are built
  // statically today, and the include keeps them working if they ever render at request time.
  outputFileTracingIncludes: {
    "/": ["./content/**/*.md"],
    "/trabajo": [PROJECTS_CONTENT],
    "/trabajo/[slug]": [PROJECTS_CONTENT],
  },
  async headers() {
    return [{ source: "/:path*", headers: [...SECURITY_HEADERS] }];
  },
};

export default nextConfig;
