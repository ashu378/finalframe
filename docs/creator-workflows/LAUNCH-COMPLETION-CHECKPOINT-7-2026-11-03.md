# FinalFrame checkpoint 7 — deliberate finishing recovery and current-model reviews

Development-only checkpoint. Email and payments remain last and disabled. Persisted tests use online FinalFrame `knowing-snail-785`; no production or Yafpay resource is changed.

## Changes

- Replace misleading project-wide force-reset controls with read-only finishing status and a deliberate retry of one eligible existing render job. Legacy bulk reset aliases fail truthfully without writing. Do not unlock approvals, clear retained worker authority, cancel peer jobs, or reload the page as a success signal.
- Select the production explicitly in projects containing multiple videos/episodes. Choices use the existing authorized, paginated project-production query; status and retry carry the selected production ID. Changing selection clears stale results. Foreign production/job combinations are denied.
- Apply the same retry eligibility inside the canonical transactional retry mutation. Accepted/unknown handoffs, retained lease/payload/provider evidence, exhausted attempts and archived projects cannot be restarted through these controls. Healthy active jobs explain that they are waiting for completion.
- Include the upstream canonical model version in BFL generation/continuation, edit and upscale capability fingerprints. A version-only catalog change invalidates the previous review and any old unaccepted quote. Accepted provider work still resumes by its existing ID.

No schema migration, destructive operation, payment change, email change, new provider service, or renderer-image change is included. After backend rollout, re-review the exact current BFL catalog rows before new admissions. Do not rewrite old frozen quotes or repurchase accepted jobs. The previous compatible deployment is the rollback revision; retain receipts, unknown holds and completed output.

## Verification

The isolated source snapshot passed application TypeScript, Convex TypeScript, all-source ESLint excluding generated renderer output, and a Next.js production build (53 generated pages). Focused actual-handler contracts passed: finishing recovery7, React recovery controls6, continuation certificates6, upscale certificates12, source-edit certificates8, Avatar certificates5 and graphics dispatch9. These pure tests use no database or paid provider calls. An independent reviewer reran both recovery suites, checked all eight file hashes and closed the multi-production selection gap without a remaining blocker.

## Actual development evidence since checkpoint 6

- Checkpoint 6 (`979bf72`) is Ready on Vercel Preview. The FinalFrame-only Coolify renderer deployment is healthy on that revision with its existing resource limits and persistent volume.
- Online source-audio extraction completed at attempt1 for the exact 0.250–1.250 second window. The stored WAV has 48,000 samples/channel at 48 kHz stereo and an exact download hash. Two of 96,000 interleaved samples differ from a separate FFmpeg build by one least-significant bit; do not claim bit-identical cross-version decoding.
- The deployed Preview UI queued and completed another extraction of 0.500–1.000 seconds. Repeating the same form intent reused the completed task. The output remains a draft project asset without inferred voice consent.
- FLUX3 source job `js7c2x16bnaxwxty2kdzpmtx9d8hhwga` completed once with verified actual cost **$0.8415**. Download: 5.041667 seconds, 121 frames, 1280×704, H264, no audio, 982,267 bytes. SHA256 `e01ee74d155f19fbdc8fcca2bcf3b5176924aecbdfb007a08880fcce6d496370`. Sampled frames show the original coherent red paper boat and stable scene; this is a technical continuation source, not whole-product creative acceptance.
- Supplied-audio Avatar job `js76vkgq7958ptr96gvaz13sbx8hh5t3` completed once with verified actual cost **$0.196416**. Download: 3.97 seconds, 720×720 with audio, 685,230 bytes. SHA256 `9486d3d1e997831fd26aed9053997c7f31e7d138a11a4d47bd40e35fecac02cb`. Decoded audio correlation with the supplied synthetic recording is 0.988634 at a 23.04 ms offset. This demonstrates source preservation/alignment; subjective temporal lip-sync and speech quality still require playback review. No personal owner likeness is claimed.
- Upscale job `js79bbstzd6c96kf6jv6brvr0h8hh39a` completed once with verified actual cost **$0.03234**. The 854×480 source became 1280×720; download601,497bytes/SHA256 `ac3011945d05e1d81dad93e02aca55e75c52fbf2a0293995e5561e49d6df831b` passed. Video has49frames/2.041667seconds at24fps; audio remains2seconds. The one-frame video extension is recorded, not hidden as exact duration preservation. Visual/audio-content review remains separate. A prior admission failed atomically for insufficient internal credits; a query confirmed zero jobs. A200-credit audited development-only grant enabled the controlled retry; no payment or provider budget increase occurred.
- Read-only browser inventory covered 61 non-payment routes with no captured console warnings/errors. This was desktop, owner-session, read-only coverage; it does not certify mutations, mobile, alternate roles, email or payments. Its misleading bulk-reset finding is addressed by this checkpoint.

Private media and evidence remain outside Git under the existing FinalFrame acceptance/artifact directories. No OpenRouter dashboard sign-in was needed. The portrait was recovered from the original paid output, without another purchase; its unknown $0.188501 cost hold remains retained.

## Remaining gates

Complete accepted-job continuation and upscale quality review, current-versus-historical workspace/export association repair, mobile and mutation journeys, captions/transitions breadth, interruption/recovery matrix and creative review of all eight recipes. Portable masks, exact performance transfer and provider voice lifecycle remain unverified unless an actual documented OpenRouter route honors those controls. Personal identity tests need consented sources. Owner policy publication approval remains outstanding. Email and payment activation are explicitly deferred to the last checkpoint.

Latest provider metadata measured cumulative **$5.958215632** after the three new successful jobs. Preserve the $10 application working cap, $15 absolute cumulative ceiling and uncertain holds; recheck the actual budgets before each new purchase. No increase or reset is authorized.
