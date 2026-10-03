# Difflab v0 prototype

Open [index.html](index.html) in a browser. Select a screen from the icon-only app bar, or open a fragment such as `index.html#plans` directly. The toolbar holds the project selector, breadcrumbs, search, and actions. Home and Tasks have no contextual sidebar. Home maps repositories to apps and libraries. Wikis has a Threads sidebar; Plans and Reviews have Chat and Threads sidebars, opened from the page header.

`index.html` is the editable source. It uses pinned CDN imports for Tailwind CSS 4.3.3, Preline UI 5.0.0 (project dropdown and sidebar pattern), and DOMPurify 3.4.16. The HTML needs internet access; there are no vendored dependencies or build steps. `snapshots/` contains six offline-viewable 1120 × 640 PNGs for the [core concepts PRD](../../../prd/0001-core-concepts/README.md). Refresh the snapshots after changing the HTML.
