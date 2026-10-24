# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hond Morvan v2 is a vacation rental website for a dog-friendly holiday home in France. Built with **Astro 5** as a static site generator with **Decap CMS** for content management, deployed to GitHub Pages.

## Commands

This project uses **bun** (not npm):

```bash
bun install              # Install dependencies
bun run dev              # Dev server at localhost:4321
bun run build            # Production build to ./dist/
bun run preview          # Preview production build
bun run decap-server     # Local CMS backend for development
bun run clear-astro      # Clear Astro cache
```

**Linting:** Biome is installed but there's no lint script configured.

## Architecture

### Content Collections (src/content/)

Astro content collections with Zod schema validation in `src/content/config.ts`:

- **pages/** - Main site pages (home, fotogalerij, tarieven, etc.) with markdown body and image arrays
- **testimonials/** - Guest reviews with name, date, rating (1-5), location
- **bookings/** - Rental periods with startDate, endDate, status (`gereserveerd`|`optie`|`geblokkeerd`)
- **config/** - Site-wide settings (pricing, contact info)

### Page Rendering

- `src/pages/*.astro` - File-based routing
- `src/layouts/BaseLayout.astro` - Base template with header/nav/footer
- `src/layouts/PageWithSidebars.astro` - 3-column grid layout extending BaseLayout
- `src/pages/gastenboek/[...page].astro` - Paginated testimonials (20 per page)

### Markdown Plugins (src/plugins/)

- **targetBlank.ts** - External links open in new tab with icon
- **youtubeEmbed.ts** - YouTube links in paragraphs auto-embed as responsive iframes

### Image Handling

- Images in `src/assets/images/`
- `src/utils/images.ts` - Glob imports all images, `getImage()` resolves paths
- Reference in frontmatter as `/images/filename.ext`

## CMS

Decap CMS at `/admin/` with GitHub OAuth backend. Config in `public/admin/config.yml`.

For local development, run `bun run decap-server` and access `localhost:4321/admin/`.

[Drikus CMS](https://github.com/studioroor/drikus-cms) reads the same content via `.drikus/config.yml`. When you add or change a field, update both configs.

## Deployment

Push to `main` triggers GitHub Actions (`.github/workflows/deploy.yml`) which builds and deploys to GitHub Pages at hondmorvan.nl.
