import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
// Gruvbox dark (hard contrast) syntax theme — see src/css/prism-gruvbox.js
import gruvboxTheme from './src/css/prism-gruvbox';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: 'Prisma AIRS Cursor Hooks',
  tagline: 'Cursor IDE hooks integrating Prisma AIRS scanning into the developer workflow',
  favicon: 'img/logo.svg',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  // Set the production url of your site here
  url: 'https://cdot65.github.io',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/prisma-airs-cursor-hooks/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'cdot65', // Usually your GitHub org/user name.
  projectName: 'prisma-airs-cursor-hooks', // Usually your repo name.

  onBrokenLinks: 'throw',

  markdown: {
    mermaid: true,
  },
  themes: ['@docusaurus/theme-mermaid'],

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: '/',
          editUrl:
            'https://github.com/cdot65/prisma-airs-cursor-hooks/tree/main/docs-site/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/logo.png',
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: true,
      respectPrefersColorScheme: false,
    },
    navbar: {
      title: 'Prisma AIRS Cursor Hooks',
      logo: {
        alt: 'Prisma AIRS Cursor Hooks Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          href: 'https://github.com/cdot65/prisma-airs-cursor-hooks',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Getting Started',
              to: '/getting-started/installation',
            },
            {
              label: 'Reference',
              to: '/reference/configuration',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/cdot65/prisma-airs-cursor-hooks',
            },
            {
              label: 'npm',
              href: 'https://www.npmjs.com/package/@cdot65/prisma-airs-cursor-hooks',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Calvin Remsburg. Built with Docusaurus.`,
    },
    prism: {
      theme: gruvboxTheme,
      darkTheme: gruvboxTheme,
      additionalLanguages: ['bash', 'json', 'diff'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
