# ConfirmDeleteDialog

## Overview

A modal asks for confirmation before a destructive action. It appears only when the user chooses Delete.

## Design

### Layout

```text
+------------------------------------------+
| Delete project?                       [X]  |
|------------------------------------------|
| This removes the project and its tasks.   |
|                    [Cancel] [Delete]      |
+------------------------------------------+
```

The buttons stack on narrow screens while preserving Cancel before Delete in keyboard order.

### Behavior

- **Default:** Focus the title or Cancel button; explain the affected project.
- **Interaction:** Cancel and Escape close without deleting; Delete submits once.
- **Loading, empty, and error:** Disable repeat submit; report server failure and allow retry.
- **Accessibility:** Use a labelled modal, trap focus while open, and restore focus to Delete trigger on close.

## Implementation

### Public API

`ConfirmDeleteDialog({ projectName, open, onCancel, onConfirm })` receives the project name and emits confirmation only once per open cycle.

### State and Data Flow

Parent owns `open` and performs deletion; the dialog owns only pending/error display.

### Styling and Responsiveness

Use shared spacing tokens and a 28rem maximum width; stack actions below 22rem.

### Dependencies and Integration

Use the design system modal primitive for focus management.

### Maintainer Notes

Test Escape, focus restoration, double-submit prevention, and the server error path.
