/**
 * Translates an API error message using the literal English source string
 * itself as the `errors` namespace's translation key (messages/en.json's
 * `errors["Trip not found"]` = "Trip not found"`, `sv.json`'s
 * = "Resan hittades inte"`) -- avoids rewriting ~160 Errors.*(...) call
 * sites to semantic keys. A message with no matching key (fully dynamic
 * ones, e.g. an uploaded file's own MIME type) passes through untranslated.
 */
export function translateApiError(
  t: { has(key: string): boolean; (key: string): string },
  message: string | undefined,
): string | undefined {
  if (!message) return message;
  return t.has(message) ? t(message) : message;
}
