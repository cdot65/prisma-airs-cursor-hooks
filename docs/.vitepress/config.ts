import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Prisma AIRS Cursor Hooks",
  description:
    "Cursor IDE hooks integrating Prisma AIRS scanning into the developer workflow",
  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/" },
      { text: "Reference", link: "/reference/config" },
    ],
    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Overview", link: "/guide/" },
          { text: "Quick Start", link: "/guide/quickstart" },
          { text: "Architecture", link: "/guide/architecture" },
          { text: "Deployment", link: "/guide/deployment" },
          { text: "Troubleshooting", link: "/guide/troubleshooting" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "Configuration", link: "/reference/config" },
          { text: "Detection Services", link: "/reference/detection-services" },
          { text: "CLI Commands", link: "/reference/cli" },
        ],
      },
    ],
    socialLinks: [
      {
        icon: "github",
        link: "https://github.com/cdot65/prisma-airs-cursor-hooks",
      },
    ],
  },
});
