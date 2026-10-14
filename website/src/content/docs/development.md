---
title: Development & publishing
description: Work on the CLI and documentation, and deploy the site through GitHub Actions.
---

## CLI development

From the repository root:

```sh
npm ci
npm run dev -- --help
npm run build
npm run typecheck
npm run lint
npm test
```

Commands live in `src/commands/`, shared operations in `src/services/`, and tests
in `test/unit/`, `test/commands/`, and `test/integration/`.

## Run the documentation locally

The site has its own dependencies and lockfile in `website/`.

```sh
npm ci --prefix website
npm run dev --prefix website
```

Open the local URL printed by Astro, including its `/akashx/` path.
To inspect the production build:

```sh
npm run check --prefix website
npm run build --prefix website
npm run preview --prefix website
```

The build includes a check for broken local links and missing assets.

## Edit the docs

- Edit introductory and reference pages in `website/src/content/docs/`.
- Edit the three runbooks in `docs/`: tenant CLI, testnet bridge, and local provider setup.
- `website/scripts/sync-docs.mjs` copies those runbooks into ignored generated pages
  before development, checks, and builds. Restart the dev server after editing a runbook.
- Internal planning documents, including the bridge diagram prompt, are not published.
- Adjust navigation and the Pages URL in `website/astro.config.mjs`.

## GitHub Pages

The repository's `.github/workflows/docs.yml` workflow:

1. Installs the website dependencies using the committed lockfile.
2. Checks Astro types and builds all documentation, including the search index.
3. Validates internal links and assets.
4. Publishes the artifact to GitHub Pages on pushes to `main`, including merged PRs.

Pull requests targeting `main` run the same checks without publishing. You can also
run the workflow manually from the Actions tab on `main`.

### One-time repository setting

In GitHub, open **Settings → Pages → Build and deployment → Source** and select
**GitHub Actions**. If the repository has deployment protection rules, allow the
`main` branch in the `github-pages` environment.

The configured URL is **https://tomash60.github.io/akashx/**. It becomes available
after the first successful deployment. No personal access token is required: the
deployment job uses GitHub's Pages and OIDC permissions.

If you rename or fork the repository, update `site` and `base` in the Astro config
and the GitHub links in the content and sync script. A custom domain normally uses
`base: '/'` with the appropriate `site` URL.

See the [Astro GitHub Pages guide](https://docs.astro.build/en/guides/deploy/github/)
for hosting configuration details.
