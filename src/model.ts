import { Effect, Schema } from 'effect';

export const categories = [
  'doom',
  'outrage',
  'curiosity',
  'clickbait',
] as const;
export type Category = (typeof categories)[number];
export const categoryNames: Record<Category, string> = {
  doom: 'Doomer framing',
  outrage: 'Outrage bait',
  curiosity: 'Disturbing curiosity',
  clickbait: 'Manipulative clickbait',
};
export const reasonNames = {
  ...categoryNames,
  custom: 'Your filters',
} as const;
export const defaultFilters = {
  doom: true,
  outrage: true,
  curiosity: true,
  clickbait: true,
} as const;
export const PREFERENCE_LIMIT = 2000;
const preferences = Schema.String.check(Schema.isMaxLength(PREFERENCE_LIMIT));
const BuiltInFilters = Schema.Struct({
  doom: Schema.Boolean,
  outrage: Schema.Boolean,
  curiosity: Schema.Boolean,
  clickbait: Schema.Boolean,
});
export const Sensitivity = Schema.Literals(['gentle', 'balanced', 'strict']);
export type Sensitivity = typeof Sensitivity.Type;
const shortText = Schema.String.check(Schema.isMaxLength(500));
export const Video = Schema.Struct({
  id: Schema.String.check(Schema.isPattern(/^[\w-]{11}$/)),
  title: Schema.NonEmptyString.check(Schema.isMaxLength(500)),
  channel: shortText,
  channelId: shortText,
});
export type Video = typeof Video.Type;
const probability = Schema.Finite.check(
  Schema.isBetween({ minimum: 0, maximum: 1 }),
);
export const Scores = Schema.Struct({
  doom: probability,
  outrage: probability,
  curiosity: probability,
  clickbait: probability,
  customHide: Schema.optionalKey(probability),
  customKeep: Schema.optionalKey(probability),
});
export type Scores = typeof Scores.Type;
export const Settings = Schema.Struct({
  enabled: Schema.Boolean,
  consent: Schema.Boolean,
  sensitivity: Sensitivity,
  filterHome: Schema.Boolean,
  filterSuggested: Schema.Boolean,
  concealPending: Schema.Boolean,
  hideTopics: preferences.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed('')),
  ),
  keepTopics: preferences.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed('')),
  ),
  builtInFilters: BuiltInFilters.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(defaultFilters)),
  ),
  allowedChannels: Schema.Record(Schema.String, Schema.String),
  overrides: Schema.Record(Schema.String, Schema.Literals(['allow', 'block'])),
});
export type Settings = typeof Settings.Type;
export const defaultSettings: Settings = {
  enabled: false,
  consent: false,
  sensitivity: 'balanced',
  filterHome: true,
  filterSuggested: true,
  concealPending: true,
  hideTopics: '',
  keepTopics: '',
  builtInFilters: defaultFilters,
  allowedChannels: {},
  overrides: {},
};
export const CacheEntry = Schema.Struct({
  scores: Scores,
  createdAt: Schema.Finite,
});
export type CacheEntry = typeof CacheEntry.Type;
export const Cache = Schema.Record(Schema.String, CacheEntry);
export type Cache = typeof Cache.Type;
export const Override = Schema.Literals(['allow', 'block', 'reset']);
export const Request = Schema.Union([
  Schema.Struct({ kind: Schema.Literal('settings') }),
  Schema.Struct({
    kind: Schema.Literal('save'),
    settings: Settings,
    apiKey: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(1000))),
  }),
  Schema.Struct({ kind: Schema.Literal('clearCache') }),
  Schema.Struct({ kind: Schema.Literal('classify'), video: Video }),
  Schema.Struct({
    kind: Schema.Literal('override'),
    video: Video,
    action: Override,
  }),
  Schema.Struct({ kind: Schema.Literal('allowChannel'), video: Video }),
]);
export type Request = typeof Request.Type;
export const PublicState = Schema.Struct({
  settings: Settings,
  hasKey: Schema.Boolean,
});
export type PublicState = typeof PublicState.Type;
export const Classification = Schema.Union([
  Schema.Struct({ status: Schema.Literal('scored'), scores: Scores }),
  Schema.Struct({ status: Schema.Literal('allowed') }),
  Schema.Struct({ status: Schema.Literal('blocked') }),
]);
export type Classification = typeof Classification.Type;
export const ErrorCode = Schema.Literals([
  'setup',
  'auth',
  'rate_limit',
  'network',
  'invalid_response',
  'storage',
  'invalid_request',
]);
export type ErrorCode = typeof ErrorCode.Type;
export const Response = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), state: PublicState }),
  Schema.Struct({ ok: Schema.Literal(true), classification: Classification }),
  Schema.Struct({
    ok: Schema.Literal(false),
    code: ErrorCode,
    message: Schema.String,
  }),
]);
export type Response = typeof Response.Type;

export const errorMessages: Record<ErrorCode, string> = {
  setup: 'Add your TypeSafe API key and enable filtering in Settings.',
  auth: 'TypeSafe rejected the API key. Update it in Settings.',
  rate_limit:
    'TypeSafe is rate limiting requests. Wait a moment, then try again.',
  network:
    'TypeSafe could not be reached. Check your connection, then try again.',
  invalid_response:
    'TypeSafe returned an unexpected response. Try again later.',
  storage:
    'Browser storage could not be read or saved. Try reloading the extension.',
  invalid_request: 'This request could not be processed. Reload the page.',
};

export const PageItem = Schema.Struct({
  video: Video,
  status: Schema.Literals(['checking', 'allowed', 'blocked', 'error']),
  reason: Schema.optionalKey(Schema.Literals([...categories, 'custom'])),
  scores: Schema.optionalKey(Scores),
  error: Schema.optionalKey(Schema.String),
});
export type PageItem = typeof PageItem.Type;
export const PageSnapshot = Schema.Struct({
  kind: Schema.Literal('doomblock:page'),
  active: Schema.Boolean,
  items: Schema.Array(PageItem),
});
export type PageState = typeof PageSnapshot.Type;
