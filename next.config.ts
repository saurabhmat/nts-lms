import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // The default is 1 MB, which is too small for both halves of the content pipeline:
      // a filled-in content workbook and, more importantly, chapter notes PDFs uploaded
      // from the chapter editor. Keep this in step with MAX_NOTES_BYTES in lib/chapters.ts.
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
