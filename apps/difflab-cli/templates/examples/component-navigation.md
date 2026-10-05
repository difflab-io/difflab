# ProjectNavigation

## Overview

A navigation rail lets members switch between project sections. The active section is always identifiable without color alone.

## Design

### Layout

```text
+---------------------+
| Project name        |
|---------------------|
| > Overview          |
|   Tasks             |
|   Activity          |
|---------------------|
|   Settings          |
+---------------------+
```

At narrow widths, the rail becomes a labelled navigation menu.

### Behavior

- **Default:** Highlight the route that matches the current page.
- **Interaction:** Arrow keys move focus within the menu; Enter activates a route.
- **Loading, empty, and error:** Render available routes while project metadata loads; show a safe fallback label on failure.
- **Accessibility:** Use a `nav` landmark, accessible item names, and `aria-current="page"` for the active link.

## Implementation

### Public API

`ProjectNavigation({ project, currentRoute, routes })` receives visible routes already filtered for permissions.

### State and Data Flow

The router owns navigation state; the component derives the active item from `currentRoute`.

### Styling and Responsiveness

Use existing navigation tokens; collapse below the compact breakpoint.

### Maintainer Notes

Route links come from the application router; do not duplicate permission checks in display code. Test route changes, keyboard operation, permission-filtered items, and compact layout.
