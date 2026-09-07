package com.trails.app.network

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import retrofit2.HttpException

private val lenientJson = Json { ignoreUnknownKeys = true }

/**
 * Pulls the server's own `{ "error": { "code", "message" } }` message out of a
 * failed Retrofit call.
 *
 * Retrofit's `HttpException.message` is only ever the status line ("HTTP 400
 * Bad Request"), which is exactly the wrong thing to show for the URL-import
 * flow this was added for: when a pasted link fails, *why* it failed is the
 * whole message ("That URL could not be reached", "That URL is not a
 * supported file type (\"text/html\")", "...exceeds the maximum upload
 * size..."), and the API already returns precisely that. Returns null when
 * there is no such envelope to read -- a plain socket/timeout failure, or a
 * non-JSON error page -- so callers keep their own @StringRes fallback.
 *
 * Deliberately scoped to the new URL-import call sites rather than retrofitted
 * onto every existing `e.message` in the app: those all report failures where
 * the local action is obvious ("Failed to upload photo"), and rewiring them is
 * a separate change.
 */
fun Throwable.apiErrorMessage(): String? {
    val http = this as? HttpException ?: return null
    val body = runCatching { http.response()?.errorBody()?.string() }.getOrNull()
    if (body.isNullOrBlank()) return null
    return runCatching {
        lenientJson.parseToJsonElement(body)
            .jsonObject["error"]
            ?.jsonObject
            ?.get("message")
            ?.jsonPrimitive
            ?.content
            ?.takeIf { it.isNotBlank() }
    }.getOrNull()
}
