/** Private, bounded submission diagnostics. Never persist provider messages or
 * request/response bodies through this contract. It does not authorize retries. */
export const SUBMISSION_DIAGNOSTIC_VERSION = 1 as const;
export const SUBMISSION_DIAGNOSTIC_MAX_BODY_BYTES = 64 * 1024;
const codes = ['invalid_request', 'invalid_request_error', 'validation_error', 'invalid_parameter', 'unsupported_parameter', 'unsupported_value', 'model_not_found', 'rate_limit_exceeded', 'insufficient_credits', 'provider_error', 'server_error', 'upstream_error', 'content_policy_violation', 'request_timeout', '400', '401', '402', '403', '404', '408', '422', '429', '500', '502', '503', '504'] as const;
const params = ['model', 'duration', 'aspect_ratio', 'resolution', 'generate_audio', 'previous_job_id', 'frame_images', 'input_references', 'upscale_factor', 'creativity'] as const;
const rejectionCategories = ['REFERENCE_PERSON_RESTRICTED', 'REFERENCE_CONTENT_REJECTED', 'REFERENCE_MEDIA_UNAVAILABLE', 'REFERENCE_DIMENSIONS_UNSUPPORTED', 'PROMPT_TOO_LONG', 'CONTROL_NOT_SUPPORTED', 'MODEL_UNAVAILABLE'] as const;
type RejectionCategory = typeof rejectionCategories[number];
type ProviderCode = typeof codes[number];
type ProviderParam = typeof params[number];
export type SubmissionDiagnostic = {
  version: 1;
  controlFingerprint: string;
  httpStatus?: number;
  requestId?: string;
  providerCode?: ProviderCode;
  providerParam?: ProviderParam;
  responseDigest?: string;
  rejectionCategory?: RejectionCategory;
};

// Read data properties only; accidental getters/toJSON must never expose a body.
function own(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object') return undefined;
  const property = Object.getOwnPropertyDescriptor(value, key);
  return property && 'value' in property ? property.value : undefined;
}
/** Reduce bounded provider feedback to fixed categories. Raw messages, source
 * URLs and echoed prompts never cross the persistence boundary. Classification
 * is diagnostic evidence only: it cannot authorize a retry or weaken a policy. */
export function classifySubmissionRejection(body: unknown): RejectionCategory | undefined {
  const error=own(body,'error'),metadata=own(error,'metadata')??own(body,'metadata');
  const messages=[own(body,'message'),own(error,'message'),own(metadata,'raw')].filter((value):value is string=>typeof value==='string'&&value.length<=4096).join(' ').slice(0,12288);
  const code=own(error,'code')??own(body,'code');
  if(/(?:reference|input|image|video).{0,120}(?:real[- ]person|real human|human face|likeness of real people)/i.test(messages)&&/(?:reject|restrict|not support|not allow|may contain|sensitive)/i.test(messages))return 'REFERENCE_PERSON_RESTRICTED';
  if(/Input(?:Image|Video)SensitiveContentDetected/i.test(String(typeof code==='string'?code:''))||/Input(?:Image|Video)SensitiveContentDetected/.test(messages))return 'REFERENCE_CONTENT_REJECTED';
  if(/prompt.{0,120}(?:too long|exceeds? (?:the )?(?:maximum|limit)|maximum.{0,30}characters)/i.test(messages))return 'PROMPT_TOO_LONG';
  if(/(?:reference|image|video|audio).{0,100}(?:could not (?:download|fetch)|download failed|url is not accessible|inaccessible url)/i.test(messages))return 'REFERENCE_MEDIA_UNAVAILABLE';
  if(/(?:reference|image|video).{0,80}(?:dimensions|width|height|aspect ratio).{0,60}(?:invalid|unsupported|not supported|out of range)/i.test(messages))return 'REFERENCE_DIMENSIONS_UNSUPPORTED';
  if(/(?:parameter|resolution|duration|aspect_ratio|generate_audio).{0,60}(?:unsupported|not supported|not allowed)/i.test(messages))return 'CONTROL_NOT_SUPPORTED';
  if(/model.{0,80}(?:not found|unavailable|not available)/i.test(messages))return 'MODEL_UNAVAILABLE';
  return undefined;
}
function member<T extends string>(value: unknown, choices: readonly T[]): T | undefined {
  return typeof value === 'string' && choices.includes(value as T) ? value as T : undefined;
}
function status(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599 ? value : undefined;
}
function requestId(value: unknown): string | undefined {
  // Only the transport's x-request-id slot is read. Unknown formats are omitted.
  return typeof value === 'string' && (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) || /^req[-_][A-Za-z0-9_-]{8,96}$/.test(value)) ? value : undefined;
}
function digest(value: unknown): string | undefined { return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value) ? value : undefined; }
async function sha256(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', copy.buffer)), byte => byte.toString(16).padStart(2, '0')).join('');
}
function controls(value: unknown) {
  const duration = own(value, 'duration');
  const aspectRatio = member(own(value, 'aspectRatio'), ['21:9', '2:1', '16:9', '4:3', '1:1', '3:4', '9:16', '9:21'] as const);
  const resolution = member(own(value, 'resolution'), ['480p', '540p', '720p', '1080p', '1440p', '2160p', '4k'] as const);
  const generateAudio = own(value, 'generateAudio');
  const continuation = own(value, 'continuation');
  const count = (key: string) => { const n = own(value, key); return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 32 ? n : undefined; };
  return {
    ...(typeof duration === 'number' && Number.isInteger(duration) && duration >= 1 && duration <= 600 ? { duration } : {}),
    ...(aspectRatio ? { aspectRatio } : {}), ...(resolution ? { resolution } : {}),
    ...(typeof generateAudio === 'boolean' ? { generateAudio } : {}),
    ...(typeof continuation === 'boolean' ? { continuation } : {}),
    ...(count('frameImageCount') !== undefined ? { frameImageCount: count('frameImageCount') } : {}),
    ...(count('inputReferenceCount') !== undefined ? { inputReferenceCount: count('inputReferenceCount') } : {}),
  };
}

/** Revalidate at a future persistence boundary; unknown fields are discarded. */
export function sanitizeSubmissionDiagnostic(value: unknown): SubmissionDiagnostic | undefined {
  const controlFingerprint = digest(own(value, 'controlFingerprint'));
  if (own(value, 'version') !== 1 || !controlFingerprint) return undefined;
  const httpStatus = status(own(value, 'httpStatus'));
  const correlation = requestId(own(value, 'requestId'));
  const providerCode = member(own(value, 'providerCode'), codes);
  const providerParam = member(own(value, 'providerParam'), params);
  const responseDigest = digest(own(value, 'responseDigest'));
  const rejectionCategory=member(own(value,'rejectionCategory'),rejectionCategories);
  return { version: 1, controlFingerprint,
    ...(httpStatus !== undefined ? { httpStatus } : {}), ...(correlation ? { requestId: correlation } : {}),
    ...(providerCode ? { providerCode } : {}), ...(providerParam ? { providerParam } : {}),
    ...(responseDigest ? { responseDigest } : {}), ...(rejectionCategory?{rejectionCategory}:{}),
  };
}

/** Hash only a caller-supplied bounded byte snapshot; never stringify an error,
 * body, prompt, URL, or arbitrary request object. No I/O or lifecycle decisions. */
export async function buildSubmissionDiagnostic(input: { error: unknown; controls: unknown; responseBodyBytes?: Uint8Array }): Promise<SubmissionDiagnostic> {
  const details = own(input.error, 'details');
  const providerCode = member(own(details, 'providerCode'), codes);
  const providerParam = member(own(details, 'providerParam'), params);
  const httpStatus = status(own(input.error, 'status'));
  const correlation = requestId(own(input.error, 'requestId'));
  const bytes = input.responseBodyBytes;
  const rejectionCategory=member(own(details,'rejectionCategory'),rejectionCategories);
  // Both sha256 calls copy their byte input before yielding, binding this call's
  // snapshot even when the caller later reuses its transport buffer.
  const [controlFingerprint, responseDigest] = await Promise.all([
    sha256(new TextEncoder().encode(JSON.stringify(controls(input.controls)))),
    bytes instanceof Uint8Array && bytes.byteLength <= SUBMISSION_DIAGNOSTIC_MAX_BODY_BYTES ? sha256(bytes) : undefined,
  ]);
  return sanitizeSubmissionDiagnostic({ version: 1,
    controlFingerprint,
    httpStatus, requestId: correlation, providerCode, providerParam, rejectionCategory,
    ...(responseDigest ? { responseDigest } : {}),
  })!;
}
