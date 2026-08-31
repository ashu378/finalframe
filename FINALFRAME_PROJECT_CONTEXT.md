# FinalFrame Project Context

This file is a portable handoff summary for continuing FinalFrame on another laptop. It is a distilled project context, not a complete chat transcript. It must never contain passwords, API keys, webhook secrets, deployment tokens, or private environment values.

## Product direction

FinalFrame is being built as a creator-first AI production studio, not a basic prompt-to-video generator.

Customer promise:

> Describe it. Paste it. Upload it. Bring your own assets. Approve the cost. Get the video.

The product should support creators, small businesses, agencies, and marketing teams producing motion graphics, 2D animation, UGC/talking-head videos, advertisements, product demos, explainers, social videos, cinematic scenes, African/Nigerian folktale workflows, and existing-footage enhancement.

Users may provide only an idea, a script, images, footage, audio, or a voice recording. A voice upload is optional; it is not required for 2D comedy or any other workflow. FinalFrame may transcribe a supplied recording and use it as production input when the user chooses.

## Locked architecture

```text
User
  ↓
Next.js application on Vercel
  ↓
Convex Auth + Convex database + Convex Storage
  ↓
AI Director and production planning
  ↓
Production Graph / Production Canvas
  ↓
Scenes → Shots → Shot Versions → Generation Jobs
  ↓
Editing Workspace / Timeline
  ↓
Convex-managed render job
  ↓
Dedicated Remotion + FFmpeg + FFprobe renderer worker
  ↓
Verified MP4 stored and registered in Convex
  ↓
Review → Approval → Download
```

Convex is the application backend, authentication authority, workflow authority, authorization layer, canonical production-data store, and initial media store. The renderer is only a compute worker for heavy video assembly; it is not another application backend or database.

The Production Canvas is a required product surface. It visually represents and lets users manipulate the production graph. The Editing Workspace and Timeline are separate but connected: Canvas answers “how is this video being produced?” while the editor answers “how should the finished video look and sound?”

## Customer-facing terminology

| Internal term | Customer-facing term |
|---|---|
| Production | Video project |
| DirectorPlan | Plan |
| Sequence | Chapter |
| Scene | Part |
| Shot | Take |
| Asset | Media |
| Creative Guide / Production Bible | Creative guide |
| Generation job | Video task |
| Assembly | Put it together |
| Render | Make video |
| Snapshot | Version |
| Credits | Video credits |

## Completed repository work

- Convex production graph and production contracts are present.
- Production Canvas and editing/release foundations are present.
- Timeline, assembly manifest, review, export, and renderer contract foundations are present.
- Credit accounting and Bachs sandbox payment foundations are present.
- Next middleware was migrated to the current proxy convention.
- Browser compatibility data was refreshed.
- Public/customer-facing design and product direction are documented in the planning files.
- The repository is connected to `https://github.com/ashu378/finalframe.git`.
- The `main` branch is currently pushed and clean.

## Current deployment identities

- Website temporary URL: `https://finalframe-nine.vercel.app`
- Convex development cloud URL: `https://knowing-snail-785.convex.cloud`
- No custom domain has been purchased yet. Do not buy one as part of this project context.

## Local environment status

`.env.local` is intentionally ignored by Git and must be recreated on a new laptop. It currently contains the corrected variable names for the Convex and Bachs sandbox configuration.

Required local variables include:

```text
NEXT_PUBLIC_CONVEX_URL=
NEXT_PUBLIC_SITE_URL=https://finalframe-nine.vercel.app
OPENROUTER_API_KEY=
RENDER_WORKER_URL=
RENDER_WORKER_SHARED_SECRET=
BACHS_API_KEY=
BACHS_API_BASE_URL=https://sandbox-api.bachs.io
BACHS_ENVIRONMENT=sandbox
BACHS_WEBHOOK_SECRET=
ERROR_TRACKING_DSN=
```

Secret values must be entered locally or through the appropriate hosting dashboard. Never commit `.env.local` or paste its values into chat.

## Renderer decision

The preferred low-cost approach is to run the FinalFrame renderer on the Contabo VPS already purchased for the owner’s infrastructure. Railway and Render.com are not required.

The Contabo machine should run a separate Dockerized renderer service with resource limits so it does not starve other applications on the VPS. Start with one concurrent render and increase only after load testing.

The renderer still needs to be completed as a network service:

1. Add an HTTP worker server around the existing `renderer/` library.
2. Add a Dockerfile containing Node, Remotion, FFmpeg, and FFprobe.
3. Add health, render, callback authentication, timeout, and cleanup behavior.
4. Deploy the worker to the Contabo VPS.
5. Connect the worker to Convex with a shared secret.
6. Run a real MP4 render and validate it with FFprobe.

For temporary testing before a custom domain exists, a Cloudflare Quick Tunnel can expose the worker over a temporary HTTPS URL. It is for testing only; later, use a stable renderer subdomain after the owner purchases a domain.

## Current blockers and inputs

- Renderer worker deployment on the Contabo VPS.
- Renderer worker URL and shared secret.
- FFmpeg and FFprobe installed inside the renderer container.
- OpenRouter live capability and quality tests.
- Authenticated browser end-to-end testing.
- Bachs sandbox checkout/webhook/refund testing.
- Optional error-tracking provider integration and DSN.
- Final legal, consent, rights, refund, and acceptable-use approvals before paid launch.

## Safe continuation order

1. On the Ubuntu laptop, clone the repository and install Node.js, pnpm, Docker, and Git.
2. Recreate `.env.local` from `.env.local.example` without committing secrets.
3. Verify typecheck, lint, build, Convex validation, renderer tests, and contract tests.
4. Build the renderer HTTP worker and Docker image.
5. Deploy the renderer worker to Contabo and connect it to Convex.
6. Test real generation, assembly, review, regeneration, and MP4 download.
7. Run authenticated browser E2E and mobile/accessibility checks.
8. Run Bachs sandbox payment tests.
9. Enable paid workflows only after quality, financial, rights, security, and operational gates pass.

## Git handoff

The repository should be continued from `main`. Before making changes on the new laptop:

```bash
git pull origin main
git status
```

Never commit secrets, `.env.local`, provider credentials, private SSH keys, or Convex deployment keys.
