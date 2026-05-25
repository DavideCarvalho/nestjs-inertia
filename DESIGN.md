---
name: nestjs-inertia
description: Inertia.js adapter for NestJS with full type safety, codegen, and Tuyau-style typed client.
---

# Design System: nestjs-inertia

## 1. Overview

**Creative North Star: "The Terminal Manifest"**

A documentation site that treats code as the primary language and prose as annotation. Every surface feels like it could exist inside a well-configured terminal: high contrast, mono-forward typography, dense information without clutter. The personality is opinionated and direct; the same confidence the library has in its API choices carries through to how the docs present themselves.

This is not a marketing site. There are no hero gradients, no animated particle backgrounds, no "trusted by 10,000 developers" counters. It is a reference that a developer keeps open in a split pane next to their IDE, and it needs to feel native to that context.

The system explicitly rejects: generic auto-generated docs with a plain white sidebar and no personality, marketing-heavy docs that prioritize buzz words over substance, and docs that explain concepts in long prose paragraphs without showing how to use them in code. If you have to read 3 paragraphs before seeing a code block, the page has failed.

**Visual Reference:** Effect.website, nestjs-filter docs — monochromatic, white-on-black, typography-driven personality.

**Key Characteristics:**
- Code blocks are the dominant visual element on every page
- Monospace typography is a first-class citizen, not subordinate to body text
- **Monochromatic zinc palette — NO chromatic accent color.** Personality comes from typography and contrast, not from color.
- Dense, scannable layout that respects split-screen reading
- Responsive motion (copy feedback, smooth transitions) without choreography
- Near-black backgrounds, white/light gray text, generous whitespace

## 2. Colors

A strictly monochromatic palette using the Tailwind zinc scale. Zero chromatic accent. Interactive elements use white or light gray for emphasis; muted states use zinc mid-tones. The palette is cool (no warm tint).

### Dark Mode (Primary)

| Token | Value | Usage |
|-------|-------|-------|
| Background | `#09090b` | Page background, nav, sidebar |
| Surface Elevated | `#18181b` | Code blocks, aside bg, inline code bg |
| Border | `#27272a` | Very subtle zinc borders, hairlines |
| Text Primary | `#fafafa` | Near-white body text, headings |
| Text Secondary | `#a1a1aa` | Muted zinc for labels, metadata |
| Text Tertiary | `#71717a` | Very muted, for timestamps, hints |
| Interactive Hover | `#e4e4e7` | Slightly brighter than text on hover |

### Light Mode

| Token | Value | Usage |
|-------|-------|-------|
| Background | `#fafafa` | Page background |
| Surface Elevated | `#f4f4f5` | Code blocks, aside bg |
| Border | `#e4e4e7` | Light zinc borders |
| Text Primary | `#18181b` | Near-black body text, headings |
| Text Secondary | `#52525b` | Muted for labels |
| Text Tertiary | `#a1a1aa` | Very muted hints |
| Interactive Hover | `#09090b` | Full black on hover |

### Named Rules

**No Chromatic Accent.** There is no colored accent. Links, active states, focus rings, and interactive elements use white (`#fafafa` in dark) or near-black (`#18181b` in light). Emphasis is achieved through brightness contrast, not hue.

**The Zinc-Only Rule.** Every color token maps to the Tailwind zinc scale (`zinc-50` through `zinc-950`). No warm tinting, no blue/green/amber/purple anywhere in the palette.

## 3. Typography

**Display Font:** Geist Sans (variable weight)
**Body Font:** Geist Sans (same as display, single sans stack)
**Code Font:** JetBrains Mono (variable weight, with ligatures)

**Character:** Mono-forward. Code is the primary language of this site. The sans-serif carries headings and explanatory prose, but monospace has equal visual weight and often dominates the page. The pairing should feel like an IDE that grew navigation.

### Hierarchy
- **Display** (bold 700, large clamp, letter-spacing -0.03em): Page titles, hero tagline. Rare.
- **Headline** (bold 700, medium, letter-spacing -0.02em): Section headings (h2). The entry point for scanning.
- **Title** (semibold 600, slightly smaller): Subsection headings (h3). Anchor targets.
- **Body** (regular, 16px, line-height 1.7, max-width 75ch): Prose between code blocks. Compact but readable.
- **Label** (medium 500, small, slight letter-spacing): Sidebar items, table headers, badge text. Often monospace.
- **Code** (regular, 14px, line-height 1.6): Inline and block code. The workhorse.

### Named Rules
**The Code Parity Rule.** Monospace text receives the same visual care as body text: comfortable line height, sufficient contrast, generous padding in code blocks. Code is not a second-class citizen rendered in a cramped dark box.

## 4. Elevation

Flat by default. Depth is conveyed through background tint shifts (Surface vs Surface Elevated), not shadows. Code blocks and asides sit on the elevated surface; everything else is flush.

No box-shadows on cards, sidebars, or navigation. Hover states use background color shift, not lift. Focus uses ring/outline treatment with the accent-high color (white in dark, near-black in light).

### Named Rules
**The No-Shadow Rule.** Shadows are prohibited. `--sl-shadow-sm`, `--sl-shadow-md`, `--sl-shadow-lg` are all set to `none`. Surfaces distinguish themselves through tonal steps only. If a container needs to stand out, it gets a tinted background or a 1px border, never a shadow.

## 5. Components

### Site Title
- Monospace (`JetBrains Mono`), white text
- No version badge (the library is stable)

### Hero (Landing Page)
- Large bold tagline with tight letter-spacing (-0.03em)
- Before/After code comparison as centerpiece, monochromatic syntax highlighting
- Install command bar: zinc border, monospace, copy button
- Primary CTA: white bg with black text (inverted), secondary CTAs: zinc border

### Sidebar
- Active item: white text, zinc-900 bg, 2px white left border
- Hover: zinc-900 bg, brighter text
- Group labels: monospace, uppercase, small, muted

### Code Blocks
- Background: `#18181b` (dark) / `#f4f4f5` (light)
- Border: 1px solid zinc-800/zinc-200
- Well-padded: 1.25rem vertical, 1.5rem horizontal
- Syntax colors: monochromatic (white for types/decorators, light gray for functions, muted gray for keywords/params, dark gray for comments)

### Tabs
- Used for framework alternatives (React / Vue 3 / Svelte 5) and package manager variants (pnpm / npm / yarn)
- Monospace tab labels
- Active tab: white text with white bottom border, no colored underline

## 6. Do's and Don'ts

### Do:
- **Do** lead every guide page with a working code example before any prose explanation.
- **Do** show React, Vue 3, and Svelte 5 examples in tabs wherever syntax differs.
- **Do** show pnpm, npm, and yarn install commands in tabs.
- **Do** keep code blocks complete and copy-paste ready: imports, decorator, class, method.
- **Do** use monospace for all technical identifiers inline, even in headings.
- **Do** use tinted neutral backgrounds for code blocks and asides; distinguish them from page background through tonal shift.
- **Do** keep all interactive states monochromatic — brighter white for emphasis, never a different hue.

### Don't:
- **Don't** use any chromatic accent color (no amber, blue, green, purple, or any hue).
- **Don't** use shadows on any surface. Elevation is tonal, not physical.
- **Don't** use gradient text or glassmorphism.
- **Don't** use warm-tinted grays. The palette is strictly cool zinc.
- **Don't** write marketing buzz words: "revolutionary", "game-changing", "blazing fast".
- **Don't** write 3 paragraphs of explanation before showing a code block.
- **Don't** truncate code examples with `// ...` for critical setup lines.
- **Don't** use `border-left` greater than 2px as a colored accent stripe.
