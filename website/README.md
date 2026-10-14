# akashx documentation

Astro + Starlight, published at https://tomash60.github.io/akashx/ after deployment.

```sh
npm ci --prefix website
npm run dev --prefix website
```

Production checks:

```sh
npm run check --prefix website
npm run build --prefix website
npm run preview --prefix website
```

Edit pages in `website/src/content/docs/`. Runbooks are sourced from `docs/` by
`scripts/sync-docs.mjs`; restart the dev server after editing them. Generated
`src/content/docs/guides/` files are ignored and must not be edited directly.

GitHub Actions checks PRs and deploys every push to `main`. Enable **Settings →
Pages → Source → GitHub Actions** once. No tokens or separate deployment branch
are needed. For URL changes, update `site` and `base` in `astro.config.mjs`.
