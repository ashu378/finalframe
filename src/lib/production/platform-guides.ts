import { getOutputPreset, type OutputPresetId } from '../../../renderer/src/output-presets';

export type PlatformGuideId = 'GENERAL' | 'TIKTOK_ADS_STANDARD_LTR' | 'TIKTOK_ADS_STANDARD_RTL' | 'GOOGLE_ADS_VERTICAL';
type GuidePoint = readonly [number, number];
interface PlatformGuide {
  id: PlatformGuideId;
  label: string;
  presets: readonly OutputPresetId[];
  canvas: { width: number; height: number };
  polygon: readonly GuidePoint[];
  description: string;
  source: null | { url: string; artifactUrl: string; artifactSha256: string; checkedAt: string; derivation: string };
}

const ALL_FORMATS = ['VERTICAL', 'LANDSCAPE', 'SQUARE', 'PORTRAIT_FEED', 'STANDARD_FRAME', 'TALL_FRAME', 'CINEMA'] as const;
const TIKTOK_SOURCE = 'https://ads.tiktok.com/resources/help/article/tiktok-auction-in-feed-ads?lang=en';
const CHECKED_AT = '2026-11-05';

/** Preview-only numeric diagrams, not platform eligibility rules or exported
 * artwork. TikTok coordinates use its labelled 720x1280 source canvas (the PNG
 * is rasterized at 4x). Google uses the vertical diagram's published margins;
 * they agree with the linked vertical PNG's exact transparent rectangle.
 * Do not substitute Google landscape/square PDF geometry for its PNG geometry.
 * No third-party image is redistributed by these numeric guides. */
export const PLATFORM_GUIDES: readonly PlatformGuide[] = [
  {
    id: 'GENERAL', label: 'General composition · 8% inset (not platform specific)', presets: ALL_FORMATS,
    canvas: { width: 100, height: 100 }, polygon: [[8, 8], [92, 8], [92, 92], [8, 92]],
    description: 'A general 8% composition inset, not a platform safe zone. Platform controls and captions may cover other areas.', source: null,
  },
  {
    id: 'TIKTOK_ADS_STANDARD_LTR', label: 'TikTok In-Feed Ads · Standard LTR · no anchor', presets: ['VERTICAL'],
    canvas: { width: 720, height: 1280 }, polygon: [[80, 160], [640, 160], [640, 560], [520, 560], [520, 840], [80, 840]],
    description: 'TikTok Standard LTR in-feed ads without an anchor. Ad-caption length and device can change coverage. This does not certify organic posts or anchor ads.',
    source: { url: TIKTOK_SOURCE, artifactUrl: 'https://lf-tt4b.tiktokcdn.com/obj/i18nblog/tt4b_cms/en-US/5jqet0ab9qci-10e7f5Vig4uhAscNP8XPB0.zip', artifactSha256: '1bca1f5755b738ea809926f42b49fc59a24acca0dee40db7f978730d0c52ca53', checkedAt: CHECKED_AT, derivation: 'In-Feed/Feed.png; labelled 720x1280 canvas, 4x raster. Left/right80, top160, bottom440, right notch120 wide from y560.' },
  },
  {
    id: 'TIKTOK_ADS_STANDARD_RTL', label: 'TikTok In-Feed Ads · Standard Arabic RTL · no anchor', presets: ['VERTICAL'],
    canvas: { width: 720, height: 1280 }, polygon: [[80, 160], [640, 160], [640, 840], [200, 840], [200, 560], [80, 560]],
    description: 'TikTok Standard Arabic RTL in-feed ads without an anchor. Ad-caption length and device can change coverage. This does not certify organic posts or anchor ads.',
    source: { url: TIKTOK_SOURCE, artifactUrl: 'https://lf-tt4b.tiktokcdn.com/obj/i18nblog/tt4b_cms/en-US/5jqet0ab9qci-1UHlc1zKkFHTtnoYGercvt.zip', artifactSha256: 'c97fcc439edab3b598d7ad725d965e94685d85e5ba3adbfee5b5f1c174a3a959', checkedAt: CHECKED_AT, derivation: 'In-Feed_RTL/Feed - RTL.png; labelled 720x1280 canvas, 4x raster. Mirrored standard LTR polygon; lower left notch ends at x200.' },
  },
  {
    id: 'GOOGLE_ADS_VERTICAL', label: 'Google Ads / YouTube video ads · vertical', presets: ['VERTICAL'],
    canvas: { width: 1080, height: 1920 }, polygon: [[48, 288], [888, 288], [888, 1248], [48, 1248]],
    description: 'Google Ads universal vertical video-ad guide. Device and placement coverage can vary. This does not certify organic Shorts, Reels, or another ad platform.',
    source: { url: 'https://support.google.com/google-ads/answer/13547298?hl=en', artifactUrl: 'https://services.google.com/fh/files/misc/youtubesafezoneoverlay_vertical_final.png', artifactSha256: '56baf502e131f3fe79a61827363f4e262eaca41f094027896afb8a4c3a120717', checkedAt: CHECKED_AT, derivation: 'Official universalsafezones-youtube.pdf vertical margins: left48/right192/top288/bottom672. Same vertical PNG transparent area x[48,888),y[288,1248), on1080x1920. No landscape or square geometry inferred.' },
  },
];

export function availablePlatformGuides(presetId: OutputPresetId): readonly PlatformGuide[] {
  const format = getOutputPreset(presetId);
  return PLATFORM_GUIDES.filter(guide => guide.presets.includes(format.id));
}

/** Ineligible or unknown choices reset to the general guide. No stretch of a
 * platform-specific polygon onto an unrelated output ratio is permitted. */
export function resolvePlatformGuide(value: unknown, presetId: OutputPresetId): PlatformGuide {
  return availablePlatformGuides(presetId).find(guide => guide.id === value) ?? PLATFORM_GUIDES[0];
}
