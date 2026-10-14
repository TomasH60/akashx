import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://tomash60.github.io',
  base: '/akashx',
  trailingSlash: 'always',
  integrations: [
    starlight({
      title: 'akashx',
      description: 'Wallets, cross-chain funding, and tenant deployments from your terminal.',
      favicon: '/favicon.svg',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/TomasH60/akashx' }],
      customCss: ['./src/styles/custom.css'],
      sidebar: [
        {
          label: 'Start here',
          items: [
            { label: 'Introduction', slug: 'index' },
            { label: 'Installation', slug: 'getting-started' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Wallets & funding', slug: 'wallets' },
            { label: 'Bridge overview', slug: 'bridge' },
            { label: 'Testnet bridge', slug: 'guides/testnet-bridge' },
            { label: 'Tenant deployments', slug: 'guides/tenant-cli' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'Commands', slug: 'commands' },
            { label: 'Local provider setup', slug: 'guides/local-provider' },
            { label: 'Development & publishing', slug: 'development' },
          ],
        },
      ],
    }),
  ],
});
