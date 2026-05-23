---
name: Do not overwrite shared files without explaining why
description: Never overwrite globals.css or other shared files — explain rationale, show diff, and prefer scoped alternatives first
type: feedback
---

Do not overwrite globals.css or other shared/foundational files without first explaining the rationale and showing a diff.

**Why:** Lawrence wants to understand what's changing and why before any global file is modified. Blindly overwriting removes existing setup (Tailwind v4 config, theme tokens) and risks breaking other parts of the project.

**How to apply:**
1. Explain why the global file needs to change
2. Show exactly what will change (diff)
3. First consider scoped alternatives: CSS modules, route-level stylesheets, Tailwind utilities, component-scoped styles
4. Only modify globals as a last resort with user approval
