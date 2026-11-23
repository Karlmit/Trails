import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { MAX_MULTIPART_UPLOAD_BYTES } from './lib/attachments';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  experimental: {
    // Preserve the full multipart request through Proxy, including its envelope.
    proxyClientMaxBodySize: MAX_MULTIPART_UPLOAD_BYTES,
  },
};

export default withNextIntl(nextConfig);
