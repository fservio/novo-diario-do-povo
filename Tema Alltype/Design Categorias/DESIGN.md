---
name: Modern Editorial Brutalism
colors:
  surface: '#fdf8f8'
  surface-dim: '#ddd9d8'
  surface-bright: '#fdf8f8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f7f3f2'
  surface-container: '#f1edec'
  surface-container-high: '#ebe7e6'
  surface-container-highest: '#e5e2e1'
  on-surface: '#1c1b1b'
  on-surface-variant: '#444748'
  inverse-surface: '#313030'
  inverse-on-surface: '#f4f0ef'
  outline: '#747878'
  outline-variant: '#c4c7c7'
  surface-tint: '#5f5e5e'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#1c1b1b'
  on-primary-container: '#858383'
  inverse-primary: '#c8c6c5'
  secondary: '#255dad'
  on-secondary: '#ffffff'
  secondary-container: '#79a9fd'
  on-secondary-container: '#003c7e'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#1a1c19'
  on-tertiary-container: '#838480'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e5e2e1'
  primary-fixed-dim: '#c8c6c5'
  on-primary-fixed: '#1c1b1b'
  on-primary-fixed-variant: '#474746'
  secondary-fixed: '#d7e2ff'
  secondary-fixed-dim: '#abc7ff'
  on-secondary-fixed: '#001b3f'
  on-secondary-fixed-variant: '#00458f'
  tertiary-fixed: '#e3e3de'
  tertiary-fixed-dim: '#c6c7c2'
  on-tertiary-fixed: '#1a1c19'
  on-tertiary-fixed-variant: '#454744'
  background: '#fdf8f8'
  on-background: '#1c1b1b'
  surface-variant: '#e5e2e1'
typography:
  display-xl:
    fontFamily: Playfair Display
    fontSize: 72px
    fontWeight: '900'
    lineHeight: 76px
    letterSpacing: -0.02em
  display-lg:
    fontFamily: Playfair Display
    fontSize: 48px
    fontWeight: '800'
    lineHeight: 52px
    letterSpacing: -0.01em
  display-lg-mobile:
    fontFamily: Playfair Display
    fontSize: 36px
    fontWeight: '800'
    lineHeight: 40px
  headline-md:
    fontFamily: Playfair Display
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 36px
  headline-sm:
    fontFamily: Playfair Display
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 28px
  body-lg:
    fontFamily: Source Serif 4
    fontSize: 20px
    fontWeight: '400'
    lineHeight: 32px
  body-md:
    fontFamily: Source Serif 4
    fontSize: 17px
    fontWeight: '400'
    lineHeight: 26px
  ui-label-bold:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 16px
  ui-label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.05em
  metadata:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 16px
spacing:
  grid-margin: 24px
  grid-gutter: 1px
  stack-xs: 4px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
  stack-xl: 64px
---

## Brand & Style

The brand personality is authoritative and urgent, rooted in the legacy of hard news but executed with a contemporary, disruptive edge. It captures the "Institutional" gravity of a national paper while adopting "Modern Brutalism" to ensure high information density and structural clarity. 

The aesthetic is characterized by raw functionality: 1px black borders, no rounded corners, and no decorative shadows. It treats the digital screen as a dynamic broadsheet where the typography carries the emotional weight and the layout provides the structural integrity. The interface must remain compelling and balanced even in the absence of photography, relying on varying typographic scales and monochromatic blocks to create visual interest.

## Colors

The palette is anchored by high-contrast neutrals to maintain readability and seriousness. 

- **Primary Background (#F5F5F0):** An off-white, paper-like surface that reduces eye strain compared to pure white while retaining a premium editorial feel.
- **Deep Black (#1A1A1A):** Used for primary text, heavy borders, and solid structural blocks.
- **Deep Brand Blue (#004A99):** Reserved for global institutional elements such as the masthead background or top-level navigation to signify trust and permanence.
- **Category Accents:** Used sparingly for metadata, section labels, and "live" indicators to provide quick visual navigation without compromising the brutalist aesthetic.

## Typography

This design system uses a dual-type system to distinguish between storytelling and navigation.

- **Editorial Layer:** Headlines and body copy use high-contrast serifs. **Playfair Display** provides the urgent, "front-page" impact for headlines, while **Source Serif 4** ensures comfortable, authoritative long-form reading for body text.
- **Interface Layer:** **Inter** is used for all "machine" elements—navigation, timestamps, category tags, and UI controls. It is often set in uppercase with slight letter-spacing to create a technical, data-driven contrast against the classical serif headlines.

## Layout & Spacing

The layout is a 12-column **asymmetrical editorial grid**. Unlike standard SaaS grids, the spacing relies on visible 1px borders to define columns and rows, mimicking the physical constraints of a newspaper's "rule lines."

- **Desktop:** A 12-column grid where content often spans irregular ratios (e.g., 7 columns for primary news, 5 for secondary/opinion) to create a dynamic, non-uniform visual rhythm.
- **Tablet:** 8-column grid with increased vertical stack spacing.
- **Mobile:** 4-column grid where all horizontal borders stretch to full-bleed.

Spacing is governed by a strict 4px base unit. Negative space is used intentionally to group related headlines, but major sections are always separated by a structural 1px solid black line.

## Elevation & Depth

This system is strictly two-dimensional. Depth is communicated through **z-axis stacking** and **color blocking** rather than lighting or shadows.

- **Flat Planes:** All surfaces reside on the same visual plane. There are no drop shadows or inner glows.
- **Inverted Blocks:** To emphasize a breaking story or a special section, the background flips from Off-white to Deep Black (#1A1A1A) or Deep Brand Blue (#004A99) with white text.
- **Structural Lines:** 1px borders act as the primary separator. When an element is hovered or active, the border weight may increase to 2px or 3px to indicate state changes, maintaining the brutalist logic.

## Shapes

The design system adheres to a **zero-radius policy**. Every UI element—including buttons, input fields, images, and dropdowns—must have sharp, 90-degree corners. This reinforces the "Modern Brutalist" aesthetic and suggests a sense of rigidity and institutional permanence.

## Components

### Buttons
Buttons are strictly rectangular with a 1px or 2px solid border. 
- **Primary:** Deep Black background with Off-white text. No rounded corners.
- **Secondary:** Transparent background with a 1px Deep Black border.
- **Hover State:** Background and text colors invert immediately with no transition or a very fast (50ms) jump.

### Inputs & Fields
Text inputs use a 1px bottom border only by default, or a full rectangular 1px border for search blocks. Labels are always set in **Inter Bold** (uppercase) and placed above the field.

### Editorial Cards
Cards are defined by their borders rather than shadows. 
- A card is simply a grid cell bounded by 1px lines.
- For "Lead Stories," the typography size increases significantly, and the bottom border becomes 4px to create a "heavy" visual anchor.

### Chips & Tags
Category tags (e.g., "POLITICS") are never pill-shaped. They are small rectangles with a solid background color (using the category accent colors) and white **Inter** text.

### Dividers
Dividers are the core of this design system. Use `1px solid #1A1A1A` for standard sectioning and `4px solid #1A1A1A` for the primary "Above the Fold" masthead separation.