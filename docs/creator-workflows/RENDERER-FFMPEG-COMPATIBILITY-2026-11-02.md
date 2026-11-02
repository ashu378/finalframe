# Renderer FFmpeg compatibility — 2 November 2026

The isolated FinalFrame Coolify resource successfully deployed checkpoint `97252b3` (deployment `mqf1ts6flnerkmddkxlrvvmv`); public health reports `finalframe-97252b3`, and the beat-analysis route is enabled. Dedicated persistent storage and CPU1/memory2GiB limits are unchanged. Development Convex beat-analysis/worker flags were enabled after this health check. Email and payments remain disabled.

A fresh original-media v5 export (`r572thvv7cxaa6n0awqkv0s0858hfrez`) failed output verification. No AI provider was called. An actual terminal reproduction inside that FinalFrame container established its FFmpeg5.1.9 produces audio3.498000s/video3.500000s when normalization combines `-frames:v105` with `-t3.5`. The laptop uses FFmpeg9.0.2 and did not show this truncation.

Removing only the video frame-stop, while retaining the canonical frame-derived `-t`, sample trim/padding and exact ffprobe frame-count checks, produces video/audio3.500000s and105frames on the VPS. The normalization arguments and actual-media105frame regression now cover this case. All renderer default suites and six actual FFmpeg normalization groups pass locally. A new container deployment and ordinary asynchronous export are still required to certify the patched end-to-end path.

The earlier successful export and failed attempt remain retained. This is a targeted finishing correction, not full launch or creative acceptance. No paid inference, Yafpay change, resource-limit increase, data purge or spending reset is included.
