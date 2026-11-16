# CosmoSPHERE — Design System v1.0

Source of truth for visual decisions in `frontend/`. Visual language is inspired by
NASA's information hierarchy and clean scientific layouts; it does not use NASA branding
and does not imply official affiliation.

Tokens live in:

| File | Contents |
| --- | --- |
| `frontend/src/styles/variables.css` | Typography, spacing, shape, control sizes, layout, motion |
| `frontend/src/styles/themes.css` | Color roles per theme, chart palette, derived tokens |
| `frontend/src/styles/globals.css` | Base element styles and text utilities |

**Rule:** components never hardcode colors. Use a role token; if none fits, add one to
`themes.css` for both themes.

---

## 1. Typography

| Family | Token | Use |
| --- | --- | --- |
| Inter | `--font-ui` (`--font-heading`) | Headings, buttons, navigation, form and UI labels |
| Public Sans | `--font-body` | Body text, descriptions, text inputs |
| DM Mono | `--font-mono` | RA/Dec, timestamps, coordinates, IDs, scientific metadata |

| Style | Token | Size / weight |
| --- | --- | --- |
| Display | `--font-size-display` | 36→56px fluid / 700 |
| H1 | `--font-size-h1` | 30→36px fluid / 700 |
| H2 | `--font-size-h2` | 24→28px fluid / 650 |
| H3 | `--font-size-h3` | 20px / 600 |
| Body | `--font-size-body` | 16px / 400 |
| Small | `--font-size-small` | 14px / 400 |
| Label | `--font-size-label` | 12px / 600, uppercase, `--letter-spacing-label` |
| Scientific data | `--font-size-data` | 14px / 500, tabular numerals |

Utilities: `.text-data` (scientific values) and `.text-label` (eyebrows, metadata keys).
`code`, `kbd`, `samp` and `pre` use DM Mono automatically. In forms, add
`Field.module.css` → `.data` to inputs that hold coordinates.

Form field labels use Small/600 instead of the 12px Label style, for readability.

Legacy size tokens (`--font-size-xs` … `--font-size-3xl`) are aliases kept until pages
migrate in Phase 2; do not use them in new code.

## 2. Color roles

| Role | Token | Light | Dark |
| --- | --- | --- | --- |
| Page | `--color-page` | `#F4F7FB` | `#0B1220` |
| Surface | `--color-surface` | `#FFFFFF` | `#111C2E` |
| Surface muted | `--color-surface-muted` | `#EAF0F6` | `#17263B` |
| Surface raised | `--color-surface-raised` | `#FFFFFF` | `#1C2D44` |
| Primary text | `--color-text-primary` | `#152238` | `#F3F6FB` |
| Secondary text | `--color-text-secondary` | `#526174` | `#B7C4D6` |
| Muted text | `--color-text-muted` | `#69788B` | `#91A2B8` |
| Border | `--color-border` | `#D7E0EA` | `#2A3B52` |
| Control border | `--color-border-strong` | `#77879C` | `#617796` |
| Brand | `--color-brand` | `#0B3D91` | `#75A7FF` |
| Interactive | `--color-interactive` | `#105BD8` | `#75A7FF` |
| Primary action | `--color-action` | `#C83E32` | `#FF8178` |
| Text on action | `--color-on-action` | `#FFFFFF` | `#0B1220` |
| Focus | `--color-focus` | `#105BD8` | `#75A7FF` |
| Success | `--color-success` | `#17732F` | `#5FD08B` |
| Warning | `--color-warning` | `#8A5A00` | `#F2B84B` |
| Error | `--color-error` | `#B42318` | `#FF8A80` |
| Information | `--color-info` | `#105BD8` | `#75A7FF` |

Each state also has a `*-subtle` background (e.g. `--color-error-subtle`), derived with
`color-mix()` so it follows the active theme.

### Contrast notes (WCAG 2.2 AA)

- Primary and secondary text pass AA on every surface in both themes.
- **Muted text** in the light theme is 4.5:1 only on Surface (white); it is ~4.2:1 on Page
  and ~3.9:1 on Surface muted. Use it on Surface, or only for large/non-essential text.
- **Dark-theme action:** white on `#FF8178` is ~2.4:1, so `--color-on-action` is dark
  (`#0B1220`, ~7.7:1). Always pair `--color-action` with `--color-on-action`.
- `--color-border` is decorative (dividers, cards). Interactive control outlines use
  `--color-border-strong` (≥3:1 against adjacent surfaces).
- Status is never conveyed by color alone: invalid fields also show a message and
  `aria-invalid`; demo/draft tags use a dashed border and text.

### Independent palettes

- **Charts:** `--chart-series-1…4`, `--chart-text`, `--chart-grid`. Data colors are
  separate from UI roles so a trace never reads as "error" or "link".
  `PlotlyChart` resolves these tokens at render time.
- **Sky viewer:** `--color-viewer-background` / `--color-on-viewer` stay dark in both
  themes. Scientific image colormaps are defined by the data, never by the UI theme.
- **Sky targets:** `--sky-target-1…5` is the fixed starlight palette of the mapped-target
  markers on the sky sphere (same in both themes). Each target picks one tone and a size
  deterministically from its id.

### Feature flags

`frontend/src/constants/uiFeatures.ts` switches each visual feature independently (sky blur,
dust, dust inertia, target markers, target list, viewer targets tab, search-page targets list,
spectrum gallery).

## 3. Themes

- Preferences: **Light**, **Dark**, **System** (`ThemePreference` in `types/theme.ts`).
- Stored in `localStorage` under `sky-explorer-theme` (`light` | `dark` | `system`).
  A missing value means System.
- The resolved theme is applied as `data-theme` on `<html>`; an inline script in
  `index.html` applies it before React mounts to avoid a flash.
- System mode follows `prefers-color-scheme` live.
- `useTheme()` exposes `theme` (resolved), `preference`, and `setPreference`.
- UI: `components/common/ThemeSwitcher` (native radio group; arrow keys move selection).

## 4. Spacing, shape and layout

Spacing scale: `--space-1…7` = 4, 8, 12, 16, 24, 32, 48px. `--space-8` (64px) is for
section separation only.

| Token | Value | Use |
| --- | --- | --- |
| `--radius-control` | 6px | Buttons, inputs, selects, segmented controls |
| `--radius-sm` | 6px | Small elements (tags, inner segments) |
| `--radius-md` | 10px | Compact panels |
| `--radius-card` | 12px | Cards |
| `--radius-full` | — | Only for truly circular elements (spinners, round icon buttons) |
| `--control-height-sm/md/lg` | 40 / 44 / 48px | Buttons and inputs |
| `--icon-button-size(-sm)` | 44 / 40px | Icon buttons |

Layout: `--layout-max-width` is 1200px (full-width scientific viewers may exceed it).
`--grid-columns` is 4 (mobile), 6 (≥640px), 12 (≥1024px), with `--grid-gap`.

Shadows: `--shadow-sm` for raised elements only; avoid stacking shadows and gradients.

## 5. Components (`components/common/`)

| Component | Notes |
| --- | --- |
| `Button` / `ButtonLink` | `primary` (solid action), `secondary` (outlined surface), `ghost` (interactive text). Sizes `sm` 40px, `md` 44px, `lg` 48px. `isLoading` shows a spinner and sets `aria-busy`. |
| `IconButton` | Requires `label` (accessible name). `secondary` or `ghost`; `square` or `circle`; `aria-pressed` styles toggles. |
| `Card` | `tone`: `default`, `muted`, `raised`; `padding`: `sm`, `md`, `lg`. Avoid cards inside cards. |
| `Field.module.css` + `FieldMessages` | Label, control, hint and error styles; `.data` for coordinate inputs. |
| `Tag` | Marks provisional content (Draft, Demo). Never omit on demo data. |
| `LoadingState` / `EmptyState` / `ErrorState` | Shared status layout. |
| `ThemeSwitcher` | Light / Dark / System selector. |

## 6. Motion and accessibility

- Durations collapse to 0 under `prefers-reduced-motion: reduce`.
- Focus ring: `--focus-ring-width` (3px) in `--color-focus`, applied via `:focus-visible`.
- Touch targets are at least 40px; primary controls are 44–48px.
