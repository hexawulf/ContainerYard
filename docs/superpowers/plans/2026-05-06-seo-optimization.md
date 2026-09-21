# SEO Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optimize `containeryard.org` for Google SEO by correctly configuring `sitemap.xml`, `robots.txt`, and HTML meta tags.

**Architecture:** Static sitemap and robots configuration combined with dynamic page titles using `react-helmet-async`.

**Tech Stack:** React, Vite, react-helmet-async.

---

### Task 1: Update Robots.txt

**Files:**
- Modify: `client/public/robots.txt`

- [ ] **Step 1: Update domain and sitemap location**

```text
User-agent: *
Allow: /
Disallow: /dashboard
Disallow: /hosts

Sitemap: https://containeryard.org/sitemap.xml
```

- [ ] **Step 2: Commit**

```bash
git add client/public/robots.txt
git commit -m "seo: update robots.txt domain and disallow protected routes"
```

---

### Task 2: Update Sitemap.xml

**Files:**
- Modify: `client/public/sitemap.xml`

- [ ] **Step 1: Update domain and routes**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://containeryard.org/</loc>
    <lastmod>2026-05-06</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://containeryard.org/login</loc>
    <lastmod>2026-05-06</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>https://containeryard.org/styleguide</loc>
    <lastmod>2026-05-06</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>
</urlset>
```

- [ ] **Step 2: Commit**

```bash
git add client/public/sitemap.xml
git commit -m "seo: update sitemap.xml with correct domain and public routes"
```

---

### Task 3: Update Index.html Meta Tags

**Files:**
- Modify: `client/index.html`

- [ ] **Step 1: Update URLs and titles**

```html
    <!-- SEO and Open Graph -->
    <title>ContainerYard - Self-Hosted Docker Management</title>
    <meta name="description" content="Fast, log-first Docker container observability with live tail, status visualization, and debugging tools" />
    <link rel="canonical" href="https://containeryard.org/" />
    <meta property="og:title" content="ContainerYard - Self-Hosted Docker Management" />
    <meta property="og:description" content="Fast, log-first Docker container observability with live tail, status visualization, and debugging tools" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://containeryard.org/" />
    <meta property="og:image" content="https://containeryard.org/screenshot.png" />
    <meta property="og:locale" content="en_US" />
    
    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="ContainerYard - Self-Hosted Docker Management" />
    <meta name="twitter:description" content="Fast, log-first Docker container observability with live tail, status visualization, and debugging tools" />
    <meta name="twitter:image" content="https://containeryard.org/screenshot.png" />

    <!-- Structured Data -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "ContainerYard",
      "description": "Fast, log-first Docker container observability with live tail, status visualization, and debugging tools",
      "url": "https://containeryard.org/",
      "applicationCategory": "DeveloperTools",
      "operatingSystem": "Linux",
      "offers": {
        "@type": "Offer",
        "price": "0"
      }
    }
    </script>
```

- [ ] **Step 2: Commit**

```bash
git add client/index.html
git commit -m "seo: update index.html meta tags with containeryard.org"
```

---

### Task 4: Add Page-Level Titles

**Files:**
- Modify: `client/src/pages/Landing.tsx`
- Modify: `client/src/pages/Login.tsx`
- Modify: `client/src/pages/StyleGuide.tsx`

- [ ] **Step 1: Update Landing.tsx**

```tsx
import { Helmet } from "react-helmet-async";
// ... in component
    <>
      <Helmet>
        <title>ContainerYard - Self-Hosted Docker Management</title>
      </Helmet>
      <div className="relative isolate ...">
```

- [ ] **Step 2: Update Login.tsx**

```tsx
import { Helmet } from "react-helmet-async";
// ... in component
    <div className="min-h-screen ...">
      <Helmet>
        <title>Login - ContainerYard</title>
      </Helmet>
```

- [ ] **Step 3: Update StyleGuide.tsx**

```tsx
import { Helmet } from "react-helmet-async";
// ... in component
    <Layout>
      <Helmet>
        <title>Style Guide - ContainerYard</title>
      </Helmet>
      <div className="container ...">
```

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/Landing.tsx client/src/pages/Login.tsx client/src/pages/StyleGuide.tsx
git commit -m "seo: add unique page titles using react-helmet-async"
```

---

### Task 5: Verification

- [ ] **Step 1: Run build**

Run: `npm run build`
Expected: Success

- [ ] **Step 2: Verify sitemap and robots output in dist**

Run: `ls dist/client/sitemap.xml dist/client/robots.txt`
Expected: Files exist and contain correct URLs.
