package com.trails.app.network.dto

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

// Builds the JSON body for a PATCH that sends only fields the user actually
// changed since `original` was captured (right after loading the existing
// entity into an edit screen's state) -- the server's PATCH schemas here are
// all `.partial()` merges (see WriteRequests.kt's header comment), so any
// field NOT present in the sent body keeps its current server-side value
// untouched. Sending every field unconditionally (the previous approach for
// TimelineEntry/Idea/ImportantInfo) meant a stale field the user never
// touched on this screen could silently overwrite a concurrent edit someone
// else made to that same field in between this screen's load and its save --
// user-reported: "Changes users make are not syncing correctly (user A
// sometimes sees something differently than user B)".
//
// `original` is null when there's nothing to diff against (a brand new
// create, not an edit); callers should never reach this for a create (create
// always POSTs the full body via its own typed request), but if they do,
// this falls back to sending every field rather than an empty body.
fun diffFields(original: Map<String, JsonElement>?, current: Map<String, JsonElement>): JsonObject =
    JsonObject(if (original == null) current else current.filter { (key, value) -> original[key] != value })

/** A trimmed string, or JsonNull once blank -- the common "optional text field" shape across these forms. */
fun jsonStringOrNull(value: String?): JsonElement {
    val trimmed = value?.trim()
    return if (trimmed.isNullOrEmpty()) JsonNull else JsonPrimitive(trimmed)
}
