# Docs Site

This is the [Docusaurus](https://docusaurus.io/) documentation site for
[prisma-airs-cursor-hooks](https://github.com/cdot65/prisma-airs-cursor-hooks).

## Installation

```bash
npm install
```

## Local Development

```bash
npm start
```

This command starts a local development server and opens a browser window. Most changes are reflected live without having to restart the server.

## Build

```bash
npm run build
```

This command generates static content into the `build` directory.

## Deployment

Deployment is automated via `.github/workflows/deploy-docs.yml` — pushes to `main` that touch `docs-site/**` build and publish to GitHub Pages through GitHub Actions. There is no manual deploy step.
