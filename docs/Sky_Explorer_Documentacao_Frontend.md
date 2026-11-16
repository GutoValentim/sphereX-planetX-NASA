# SKY EXPLORER

## Product documentation and frontend specification

**Project:** Sky Explorer — NASA Space Apps Challenge
**Version:** 1.0 | **Status:** Historical implementation-planning reference
**Scope:** React + TypeScript + Vite frontend

This historical specification retains the original working name and proposed design. For the current CosmoSPHERE implementation, use [frontend/README.md](../frontend/README.md), the [design system](DESIGN_SYSTEM.md), and the [API contract](api.md).

---

## 1. Overview

**Sky Explorer** is a web application for visually exploring astronomical observations from the **SPHEREx** space telescope. Users enter celestial coordinates and optionally a date. The application requests backend data and displays images, temporal observations, spectral bands, charts, and metadata.

The frontend owns interface, interaction, input validation, and presentation. Data retrieval, calibration, combination, and scientific image processing belong to the backend.

### 1.1 Goals

1. Make SPHEREx observation exploration understandable and accessible.
2. Locate sky regions using right ascension (RA) and declination (Dec).
3. Display images and navigate between observations.
4. Select available spectral bands.
5. Display observation-related charts and metadata.
6. Present the project's scientific and institutional context.

### 1.2 Experience principles

- **Clarity:** every page has an obvious purpose.
- **Consistency:** navigation, colors, typography, controls follow a shared system.
- **Feedback:** actions expose loading, success, empty, or error states.
- **Progressive disclosure:** prioritize essential information and avoid visual overload.
- **Responsiveness:** remain usable on desktop and mobile.
- **Scientific integrity:** never present simulated data as real observations.

---

## 2. Scope and responsibilities

### 2.1 Scope of this stage

Build the frontend foundation:

- Folder structure and modular organization.
- React, TypeScript, Vite setup.
- Page navigation.
- Light/dark themes.
- Reusable visual components.
- Home page.
- Coordinate/parameter form.
- Astronomical viewer page structure.
- Components prepared for Aladin Lite and Plotly.
- Timeline structure.
- Interface states and clearly identified simulated data when needed.

Prioritize a functional, organized, extensible foundation. Complete live integrations later as backend endpoints and contracts become available.

### 2.2 Outside initial scope

Unless explicitly requested, this stage excludes:

- Complete queries to NASA or IRSA services.
- FITS downloads and processing.
- Calibration, alignment, resampling, image subtraction.
- Scientific spectral-band summation.
- Spectrum or astronomical-metric calculations.
- Fabricated scientific data.
- Broad backend restructuring.

### 2.3 Frontend responsibilities

- Collect and validate parameters.
- Convert RA to decimal degrees according to the API contract.
- Send queries through a service layer.
- Interpret responses using defined types.
- Display images, charts, metadata, observations.
- Manage navigation, selections, UI state.
- Present loading and error messages.

### 2.4 Backend responsibilities

- Query astronomical data sources.
- Find observations matching coordinates/date.
- Process and prepare images/metadata.
- Provide results in frontend-compatible formats.
- Report available bands, dates, times, metadata.
- Return structured errors.

**Core rule:** the frontend must not assume how scientific data are retrieved or processed. Consume results actually supplied by the backend.

---

## 3. Technologies

| Technology | Responsibility |
|---|---|
| React | Component-based UI |
| TypeScript | Development-time typing and safety |
| Vite | Development and build environment |
| React Router | Page navigation |
| Aladin Lite | Sky visualization and navigation |
| Plotly | Charts and data visualization |
| CSS | Styling, responsiveness, themes |

### 3.1 Dependency guidelines

- Reuse installed dependencies when suitable.
- Avoid redundant libraries.
- Isolate Aladin Lite and Plotly in dedicated components.
- Check version compatibility before installing/upgrading packages.
- Add global state management only for a demonstrated need.

---

## 4. Frontend architecture and organization

Organize by responsibility; avoid oversized components and unnecessary page dependencies.

### 4.1 Recommended structure

``` text
frontend/
├── public/
│   ├── images/
│   └── icons/
├── src/
│   ├── assets/
│   │   ├── images/
│   │   └── fonts/
│   ├── components/
│   │   ├── common/
│   │   │   ├── Button.tsx
│   │   │   ├── ThemeToggle.tsx
│   │   │   ├── LoadingState.tsx
│   │   │   ├── ErrorState.tsx
│   │   │   └── EmptyState.tsx
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   ├── Footer.tsx
│   │   │   └── PageContainer.tsx
│   │   ├── home/
│   │   │   ├── HeroSection.tsx
│   │   │   ├── InformationCard.tsx
│   │   │   └── TeamSection.tsx
│   │   ├── explore/
│   │   │   ├── CoordinateForm.tsx
│   │   │   ├── CoordinateInput.tsx
│   │   │   ├── DateSelector.tsx
│   │   │   └── SpectralBandSelect.tsx
│   │   └── viewer/
│   │       ├── AladinViewer.tsx
│   │       ├── ViewerToolbar.tsx
│   │       ├── SpectralBandPanel.tsx
│   │       ├── ViewModeToggle.tsx
│   │       ├── TimelinePlayer.tsx
│   │       ├── ObservationMetadata.tsx
│   │       └── SpectralChart.tsx
│   ├── pages/
│   │   ├── Home.tsx
│   │   ├── ExploreTheSky.tsx
│   │   └── SeeTheSky.tsx
│   ├── services/
│   │   └── api.ts
│   ├── hooks/
│   │   └── useTheme.ts
│   ├── types/
│   │   ├── coordinates.ts
│   │   ├── observation.ts
│   │   └── api.ts
│   ├── utils/
│   │   ├── coordinateConversion.ts
│   │   ├── coordinateValidation.ts
│   │   └── dateFormatting.ts
│   ├── styles/
│   │   ├── globals.css
│   │   ├── themes.css
│   │   └── variables.css
│   ├── App.tsx
│   └── main.tsx
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

This structure is a reference, not a requirement to create empty files. Create modules only when they have a real responsibility.

### 4.2 Directory responsibilities

- `pages/`: page composition.
- `components/common/`: reusable controls and states.
- `components/layout/`: header, footer, shared structure.
- `components/home/`: home-page components.
- `components/explore/`: query fields and controls.
- `components/viewer/`: viewer, timeline, bands, charts.
- `services/`: HTTP communication.
- `hooks/`: reusable React logic.
- `types/`: shared interfaces and types.
- `utils/`: conversion, validation, formatting.
- `styles/`: tokens, themes, global styles.

### 4.3 Implementation rules

1. Give each component a clear responsibility.
2. Do not put an entire page in one file.
3. Do not duplicate styling or validation rules.
4. Keep backend calls outside visual components.
5. Type props, state, API responses.
6. Avoid `any`; prefer explicit types or validated `unknown`.
7. Avoid generic abstractions without a concrete need.
8. Keep component/file naming consistent.
9. Do not change files outside `frontend/` without need and authorization.
10. Inspect existing features and preserve their purpose.

---

## 5. Navigation and routes

| Page | Route | Purpose |
|---|---|---|
| Home | `/` | Project introduction |
| ExploreTheSky | `/explore` | Parameter input |
| SeeTheSky | `/viewer` | Result visualization |

### 5.1 Main flow

```text
Home
  → ExploreTheSky
  → submit parameters to backend
  → backend response
  → SeeTheSky
  → ExploreTheSky (new query)
```

### 5.2 Navigation rules

- Internal pages provide a back control.
- Preserve query parameters when opening the viewer.
- “Explore again” returns to `/explore`.
- Handle direct `/viewer` access without a query: redirect to `/explore` or display guidance.
- Use internal navigation without full-page reloads.

---

## 6. Visual system

The interface should be scientific, modern, consistent, accessible.

### 6.1 Typography

| Use | Font |
|---|---|
| Titles and headings | Montserrat |
| Body, forms, controls | Manrope |

Avoid adding other font families without a need.

### 6.2 Initial light-theme palette

| Element | Color | Code |
|---|---|---|
| Primary text | Grey11 | `#1C1C1C` |
| Page background | Azure2 | `#E0EEEE` |
| Cards | WhiteSmoke | `#F5F5F5` |
| Buttons | Maroon | `#B03060` |
| Header/footer | LightSkyBlue | `#87CEFA` |
| Highlights | DarkSlateBlue | `#483D8B` |

### 6.3 Initial dark-theme palette

| Element | Color | Code |
|---|---|---|
| Primary text | GhostWhite | `#F8F8FF` |
| Page background | Grey11 | `#1C1C1C` |
| Cards | Deep blue | `#24364D` |
| Buttons | MediumOrchid | `#BA55D3` |
| Header/footer | MidnightBlue | `#191970` |
| Highlights | Tan1 | `#FFA54F` |

These are initial references. Adjustments may improve contrast and legibility without changing the identity.

### 6.4 Design tokens

Centralize colors and visual properties in CSS variables. Do not scatter hexadecimal values across components.

``` css
:root {
  --color-background: #E0EEEE;
  --color-surface: #F5F5F5;
  --color-text: #1C1C1C;
  --color-primary: #B03060;
  --color-accent: #483D8B;
}

[data-theme="dark"] {
  --color-background: #1C1C1C;
  --color-surface: #24364D;
  --color-text: #F8F8FF;
  --color-primary: #BA55D3;
  --color-accent: #FFA54F;
}
```

Token names represent roles, allowing palette changes without modifying every component.

### 6.5 Light and dark themes

- Minimal sun/moon icon button.
- Switching updates every page and component.
- Cards, text, borders, fields, menus, charts follow the theme.
- Use subtle transitions.
- Choose a coherent initial theme; persist preference only if appropriate.
- Ensure adequate contrast in both themes.

### 6.6 Animations

Use sparingly:

- Fade-in and subtle vertical movement on home cards.
- Smooth theme transitions.
- Hover/focus/active feedback.
- Subtle menu/panel transitions.

Respect `prefers-reduced-motion`, reducing/removing animation when requested by the operating system.

---

## 7. Page specifications

## 7.1 Home (`/`)

### Hero

Include:

- Title: **Sky Explorer**.
- Introductory SPHEREx/application-purpose text.
- **Start exploring** button linking to `/explore`.
- Theme switch in the upper-right corner.
- Dynamic background image.

**Light theme:** blue sky, clouds, sunlight.
**Dark theme:** universe, stars, galaxies, planets.

Keep text legible through an overlay or gradient when necessary. Animation must not impair reading, performance, or navigation.

### Information sections

Create three cards or visual blocks:

1. **What is SPHEREx?** Mission, history, goals, technology.
2. **Sky Explorer — NASA Space Apps Challenge:** challenge, purpose, how the tool works.
3. **Who we are:** team and members.

Final copy will be supplied later. Mark provisional text clearly. Cards should appear with subtle animation when entering the viewport.

### Footer

Include project identification, credits, relevant links, and institutional references when supplied. Match the active theme.

---

## 7.2 ExploreTheSky (`/explore`)

### Goal and structure

Let users enter a sky position and observation parameters.

Include a header with back control, title **Explore the Universe**, a centered form, grouped fields, primary action, and validation messages near their fields.

### Celestial coordinates

**Right ascension (RA)**

- Hours, minutes, seconds input.
- Separate fields for each unit.
- Hours from 0 to less than 24.
- Minutes/seconds from 0 to less than 60.
- Convert to decimal degrees before submission if that is the agreed backend format.

```text
RA_degrees = 15 × (h + m/60 + s/3600)
```

**Declination (Dec)**

- Degree input.
- Accept positive and negative values.
- Allow decimal degrees.
- Validate between `-90°` and `+90°`.

**Celestial reference:** the vernal point/equinox is the origin of right ascension, not a third input field.

### Date selection

Offer two choices:

- Use the latest available observation.
- Enter a specific date.

When enabled:

- Display a date picker.
- Show `DD/MM/YYYY`.
- Validate actual calendar dates.
- Submit `YYYY-MM-DD`.

Do not assume every chosen date has an observation; that depends on the backend response.

### Spectral selection

- Dropdown of available bands.
- Initial option `P` (default).
- Remaining options alphabetically.
- Populate from project-defined or backend-provided values.
- Never invent band names.
- Ensure keyboard/mobile accessibility.

### Submission

Button: **View →**.

On click:

1. Validate fields.
2. Block invalid submissions.
3. Prepare API-compatible parameters.
4. Show loading state.
5. Submit the query.
6. On success, open `/viewer` preserving the query.
7. On failure, keep the user on the form and show a clear message.

Do not simulate successful live queries when the backend is disconnected.

---

## 7.3 SeeTheSky (`/viewer`)

### Goal

Display backend images and explore observations, spectral bands, temporal information, charts.

Title: **SPHEREx Image**.

### Main layout

- **Left:** band selection.
- **Center:** astronomical viewer.
- **Right:** image/chart toggle.
- **Header:** title, back control, contextual controls.
- **Temporal area:** observation navigation.

On smaller screens, reorganize/collapse side panels while retaining access to controls.

### Aladin Lite

`AladinViewer` encapsulates the library and should:

- Display the received astronomical image/layer.
- Support field navigation, zoom, pan/drag.
- Respond to scrolling when supported.
- Update according to the selected observation.

**Technical guidelines:**

- Isolate integration.
- Do not recreate the instance on every React render.
- Manage initialization and cleanup correctly.
- Avoid conflicts between custom/native controls.
- Use Aladin for display, not scientific processing.

### Zoom and pan

Provide grouped `+ | -` controls. Prefer native Aladin behavior. Cursor `grab`/`grabbing` may be used when matching actual interaction.

### Spectral bands

The left panel should:

- Display available bands.
- Select all initially when the query defines that behavior.
- Allow individual selection/deselection.
- Clearly identify active bands.
- Update display when selection changes.
- Indicate when no bands are selected.

Band combination is supplied/processed by the backend. The frontend sends selection and presents results. Do not assume directly summing different-band images is scientifically equivalent to a conventional image.

### Image/chart toggle

Provide a right-side control switching:

- **Image:** Aladin.
- **Chart:** Plotly.

Use the same region for both modes. Switching must preserve temporal/spectral selection.

### Plotly charts

`SpectralChart` should:

- Isolate Plotly.
- Render backend-provided data.
- Allow choosing the information type according to available data.
- Resize to available space.
- Show loading, empty, error states.
- Update when relevant parameters change.

Do not invent axes, units, series, or scientific values. Chart definitions depend on the backend contract.

### Timeline

Temporal navigation is central. `TimelinePlayer` traverses observations from newest to oldest.

Controls:

- Observation-selection slider.
- Previous/next buttons.
- Play/pause.
- Active observation date/time.
- Sequence position when useful.

**Behavior:**

1. Initially choose the latest observation unless a requested date matches another.
2. Slider changes update the active observation.
3. Update the image with the active observation.
4. Update metadata together with it.
5. Advance automatically during playback.
6. At the end, pause or restart according to the product decision.

Decouple timeline and viewer. The timeline controls the active observation's index/ID; the viewer receives that observation.

### Metadata

Below the main area, show available:

- RA, Dec.
- Observation date/time.
- Selected bands.
- Observation ID.
- Other relevant backend metadata.

Use clear labels/units. Never display fictional values as real data.

### Explore again

At the bottom, provide **Explore again →**, linking to `/explore`.

---

## 8. Backend integration

Centralize communication in `services/api.ts`.

### 8.1 Principles

- Do not scatter `fetch` calls across components.
- Do not invent endpoints/response formats.
- Confirm the contract with the backend team.
- Define TypeScript types matching actual data.
- Handle HTTP errors, invalid responses, missing data.
- Separate query, observation, image, and metadata models.

### 8.2 Conceptual input

A query may require:

- RA in decimal degrees.
- Dec in decimal degrees.
- A specific date or latest-observation indication.
- One band or a set of bands.

Final format must follow the agreed backend contract.

### 8.3 Conceptual output

A response may contain:

- Query ID.
- Queried coordinates.
- Observation list.
- Dates/times.
- Image identifiers/references.
- Available bands.
- Metadata.
- Chart data.

This is a conceptual proposal, not a final contract. Confirm names, types, required fields, and formats before integration.

### 8.4 Asynchronous states

| State | Behavior |
|---|---|
| Idle | Interface ready |
| Loading | Loading indicator; appropriate controls disabled |
| Success | Display received data |
| Empty | Explain that no observations were found |
| Error | Clear message and retry option |

Do not leave unexplained blank areas while loading or when no results exist.

---

## 9. Responsiveness and accessibility

### 9.1 Responsiveness

Support desktop, laptop, tablet, smartphone.

- Avoid fixed widths causing overflow.
- Reorganize side panels on small screens.
- Preserve form/metadata legibility.
- Give the viewer adequate working space.
- Adapt timeline controls to touch.
- Avoid menus permanently covering the view.

### 9.2 Accessibility

- Semantic HTML.
- Field-associated labels.
- Keyboard navigation.
- Visible focus.
- Do not convey selection/errors through color alone.
- Adequate contrast.
- Accessible icon/control names.
- Respect `prefers-reduced-motion`.

---

## 10. Performance and stability

- Avoid unnecessary renders.
- Do not recreate Aladin/Plotly instances unnecessarily.
- Load heavy resources only when needed.
- Optimize images/fonts.
- Clean up listeners, instances, resources on unmount.
- Handle image-loading failures.
- Avoid large astronomical files in React state.
- Separate UI state from scientific data.
- Do not block navigation for operations that can safely run in the background.

---

## 11. Implementation plan

### Stage 1 — Foundation

- Inspect existing structure.
- Confirm dependencies/scripts.
- Configure routes.
- Define folders.
- Implement design tokens/themes.
- Create header, footer, common components.

**Completion:** the application starts, navigates, and switches themes consistently.

### Stage 2 — Home

- Implement hero and theme-dependent background.
- Add call to action.
- Create information cards.
- Implement subtle animations.
- Create footer.

**Completion:** responsive, coherent page in both themes.

### Stage 3 — ExploreTheSky

- Implement form.
- Create RA/Dec fields.
- Implement RA validation/conversion.
- Create date/band selectors.
- Implement submission/error states.

**Completion:** form produces typed, validated parameters even before live integration.

### Stage 4 — SeeTheSky structure

- Create layout/panels.
- Create Aladin/Plotly placeholders.
- Create band selector/timeline.
- Create metadata display.
- Implement image/chart switching.

**Completion:** visual flow works with clearly identified simulated data.

### Stage 5 — Integration

- Confirm API contract.
- Implement HTTP services.
- Connect form/backend.
- Map responses to frontend types.
- Integrate Aladin Lite/Plotly.
- Synchronize timeline, image, metadata.
- Handle errors/empty data.

**Completion:** a live query follows the complete flow.

### Stage 6 — Review

- Test navigation.
- Test coordinate/date validation.
- Test both themes.
- Test responsiveness.
- Check console/build.
- Review accessibility/performance.

---

## 12. Acceptance criteria

- [ ] All three pages implemented.
- [ ] Routes work correctly.
- [ ] Header/footer reused where appropriate.
- [ ] Light/dark themes work throughout the application.
- [ ] Colors/fonts centralized.
- [ ] Form validates coordinates/dates.
- [ ] RA conversion implemented and testable.
- [ ] Loading/error/empty states covered.
- [ ] Viewer structure supports Aladin/Plotly.
- [ ] Timeline controls active observation.
- [ ] Band selection works.
- [ ] Metadata follows selection.
- [ ] Layout works on desktop/mobile.
- [ ] Fictional data not presented as scientific data.
- [ ] TypeScript compiles without errors.
- [ ] Production build succeeds.

---

## 13. Guidelines for Cursor and coding agents

1. Read this documentation before code changes.
2. Inspect the existing structure and identify working behavior.
3. Work only in `frontend/` unless explicitly authorized otherwise.
4. Implement one stage at a time.
5. Present a short plan before significant changes.
6. Preserve existing features.
7. Never invent endpoints, responses, bands, scientific values.
8. Justify dependency installation.
9. Do not create files/abstractions merely to fill the proposed structure.
10. Run TypeScript/build checks after significant changes.
11. Report created/modified files.
12. Record pending items requiring backend/team decisions.

**Final priority:** deliver a clear, consistent, functional, extensible interface. Architecture should help development, not make it slower or more complex than the project requires.
