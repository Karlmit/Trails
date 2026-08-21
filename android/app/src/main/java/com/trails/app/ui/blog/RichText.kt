package com.trails.app.ui.blog

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * lib/rich-text.ts::extractPlainText, ported 1:1 -- Blog Post `description`
 * is stored as BlockNote's own Block[] JSON (see the Android app's Phase 4
 * plan for offline drafting); this app only ever reads it, walking the same
 * `content`/`children` keys every block shape carries, dependency-free (no
 * BlockNote-equivalent rendering here at all -- a real rich-text renderer is
 * future work, this is the same plain-prose fallback the web's own list-view
 * excerpt uses).
 */
fun extractPlainText(raw: String?): String {
    if (raw.isNullOrBlank()) return ""
    val parsed = runCatching { Json.parseToJsonElement(raw) }.getOrNull() ?: return raw
    val blocks = parsed as? JsonArray ?: return raw

    val parts = mutableListOf<String>()
    fun walk(list: JsonArray) {
        for (blockEl in list) {
            val block = blockEl as? JsonObject ?: continue
            when (val content = block["content"]) {
                is JsonPrimitive -> if (content.isString) parts.add(content.content)
                is JsonArray -> for (inline in content) {
                    val text = (inline as? JsonObject)?.get("text") as? JsonPrimitive
                    if (text != null && text.isString) parts.add(text.content)
                }
                else -> Unit
            }
            (block["children"] as? JsonArray)?.let { if (it.isNotEmpty()) walk(it) }
        }
    }
    walk(blocks)

    return parts.joinToString(" ").replace(Regex("\\s+"), " ").trim()
}
