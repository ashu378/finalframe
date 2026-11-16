# FinalFrame professional brand kit — v1

Start with `05-guidelines/brand-overview.png` and the four-page `brand-guidelines.pdf`.

## Contents
- **01-logos** — horizontal, stacked, symbol and wordmark; transparent black, white and lime; SVG, PNG and PDF. Primary dark/light lockups included.
- **02-icons** — light/dark/lime profile avatars, app icons, SVG/ICO favicon and PNG sizes 16–512 px; Apple touch icon at 180 px.
- **03-social** — square post, portrait Story/Reel cover, X, LinkedIn, Facebook and YouTube headers. SVG editable artwork + PNG ready exports. Review each platform crop before posting.
- **04-marketing** — website/link preview, presentation cover, A4 letterhead and email-signature HTML. No email service has been enabled.
- **05-guidelines** — identity board and four-page brand guide.
- **source** — reproducible generator, campaign copy/colors and original OFL licensed fonts. Logo SVG/PDF text is outlined, so recipients do not need the fonts.
- **concept** — unchanged ImageGen concept and prompt; final logo is the precise vector master, not the concept image.

## Editing
Open SVG masters in Figma, Illustrator, Affinity or Inkscape. Scale proportionally. The vector wordmark uses Manrope Bold. To change marketing copy, edit source/copy-and-colors.json for reference, then the strings in source/build.py and regenerate. Marketing SVG text is outlined to avoid missing fonts.

Python dependencies: `fonttools cairosvg pillow pypdf`. Run `python source/build.py`. The builder derives all sizes from original vectors; no generated concept pixels are traced or edited.

## Usage
Use black on white or lime. Use white or lime on dark. Keep at least one-quarter mark-width clear space. Minimum horizontal width 160 px; standard mark 24 px; use the specific favicon files for smaller sizes. Do not add shadows, rotate, stretch or add extra colors.

Print PDFs are scalable RGB artwork; request your printer's CMYK conversion and proof. The package does not claim trademark registration or legal clearance. No customer data, API secrets or third-party competitor artwork is included.

## Website integration
App headers, footer, creator/admin navigation, authentication, optional setup, favicon, Apple touch icon and social metadata use this identity. Versioned public files live in public/brand. The full marketing pack is kept here, rather than sent to Convex Storage.
