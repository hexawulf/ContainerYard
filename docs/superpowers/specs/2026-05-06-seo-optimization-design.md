# Design: SEO & Sitemap Optimization for ContainerYard

**Date:** 2026-05-06  
**Status:** Approved  
**Author:** Gemini CLI

## Goal
Optimize `containeryard.org` for Google SEO by correctly configuring `sitemap.xml`, `robots.txt`, and HTML meta tags.

## Scope
- Update primary domain from `containeryard.piapps.dev` to `containeryard.org`.
- Configure `sitemap.xml` with all public routes.
- Configure `robots.txt` to point to the correct sitemap.
- Update `index.html` with correct canonical and social meta tags.
- Implement unique page titles for public routes.

## Implementation Details

### 1. Domain Migration
Replace all instances of `https://containeryard.piapps.dev/` with `https://containeryard.org/` in the following files:
- `client/index.html`
- `client/public/robots.txt`
- `client/public/sitemap.xml`

### 2. Sitemap Configuration (`client/public/sitemap.xml`)
Include the following public routes:
- `/` (Priority 1.0, daily)
- `/login` (Priority 0.5, monthly)
- `/styleguide` (Priority 0.3, monthly)

### 3. Robots Configuration (`client/public/robots.txt`)
- Allow all user agents.
- Point to `https://containeryard.org/sitemap.xml`.
- Explicitly disallow `/dashboard` and `/hosts` if necessary (though they are protected, it's good practice).

### 4. HTML Meta Tags (`client/index.html`)
- Update `<title>`, `<meta name="description">`, canonical link, and Open Graph/Twitter tags.
- Use `containeryard.org` in all URL-based tags.

### 5. Page-Level SEO
Update components to use `react-helmet-async` for specific titles:
- `Landing.tsx`: "ContainerYard - Self-Hosted Docker Management"
- `Login.tsx`: "Login - ContainerYard"
- `StyleGuide.tsx`: "Style Guide - ContainerYard"

## Verification
- Validate `sitemap.xml` syntax.
- Verify `robots.txt` output.
- Inspect rendered HTML for correct meta tags on each route.
- Run `npm run build` to ensure no regressions.
