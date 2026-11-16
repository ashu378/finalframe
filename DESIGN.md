---
name: FinalFrame
description: A clear cinematic studio in black, white and lime
colors:
  primary: "#C6F432"
  neutral-bg: "#0B0B0C"
  panel: "#161618"
  raised: "#222225"
  text: "#FFFFFF"
  muted: "#A6A6AE"
typography:
  display:
    fontFamily: "Bricolage Grotesque, Manrope, sans-serif"
    fontWeight: 600
    letterSpacing: "-0.035em"
  body:
    fontFamily: "Manrope, sans-serif"
    fontSize: "16px"
rounded:
  control: "12px"
  panel: "16px"
spacing:
  compact: "8px"
  normal: "16px"
  section: "32px"
---

# Design System: FinalFrame

## Overview
Owner-approved15November2026 replacement for the previous blue/amber theme. Public surfaces persuade through relevant media and a signature interactive storyboard. Creator/admin surfaces prioritize clear actions and readable saved state. Implemented presentation groups now include public, authentication, creator/project, production/editor/review, movie/finishing, account/team, administration and utility screens. Source and component checks do not replace the separately tracked private browser review.

## Colors
Lime identifies primary actions and active navigation. Use dark text on lime buttons. Neutral surfaces distinguish controls without unnecessary shadows. Errors and warnings retain separate semantic colors and labels. CSS tokens are the implementation source; hex values above describe their rounded equivalents.

## Typography
Locally hosted OFL Manrope for application/body and Bricolage Grotesque for display. Phone input text is16px, measured controls52px. Sentence-case action labels and visible focus.

## Layout
Single-column phone account screens with a clear heading and form; add an explanatory second column from1024px. Studio navigation uses the same destination component on desktop and in the native mobile dialog. Body text remains readable without horizontal scrolling.

## Elevation & Depth
Flat neutral panels, quiet dividers. Public 3D belongs to storytelling; do not animate working forms or entire dashboards.

## Shapes
Controls use12px corners. Touch controls are at least44px high. Form fields and submit buttons are52px on authentication screens.

## Components
Shared button variants preserve their API and disabled/loading behavior. Mobile studio navigation uses a native modal dialog with focus containment, Escape dismissal, explicit close, and focus return. Sign out remains available.

## Do's and Don'ts
Preserve backend actions, roles, project isolation, immutable versions and cost confirmations. Never claim palette adoption means a screen is redesigned. Preserve on-demand media. Legacy hardcoded colors and broad theme overrides remain migration work for later chunks, not the new standard. Email and payment activation remain deferred.
