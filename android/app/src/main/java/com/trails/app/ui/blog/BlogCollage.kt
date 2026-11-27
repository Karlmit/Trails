package com.trails.app.ui.blog

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

internal const val MAX_COLLAGE_PHOTOS = 9

internal val BLOG_PHOTO_URL = Regex("/api/v1/photos/([^/]+)/file")
private val collagePhotoUrl = Regex("(?:https?://[^/?#]+)?/api/v1/photos/([^/?#]+)/file")
private val collageRows = listOf(
    listOf(1), listOf(1, 1), listOf(1, 2),
    listOf(2, 2), listOf(2, 3), listOf(2, 2, 2),
    listOf(2, 2, 3), listOf(2, 3, 3), listOf(3, 3, 3),
)

internal fun photoCollageRows(count: Int): List<Int> = collageRows.getOrElse(count - 1) { emptyList() }

internal data class StoredCollagePhoto(val id: String?, val photoId: String)

/** Returns null for groups whose children should be read through the ordinary block traversal. */
internal fun storedCollagePhotos(block: JsonObject): List<StoredCollagePhoto>? {
    val props = block["props"] as? JsonObject ?: return null
    val url = props["url"]
    if (block["type"] != JsonPrimitive("layoutImage") || props["collage"] != JsonPrimitive(true) ||
        (url != null && url != JsonNull && url != JsonPrimitive("")) || !block["content"].isEmptyBlockContent()
    ) return null
    val children = block["children"]
    if (children == null || children == JsonNull) return emptyList()
    if (children !is JsonArray || children.size > MAX_COLLAGE_PHOTOS) return null
    return children.map { element ->
        val child = element as? JsonObject ?: return null
        val childProps = child["props"] as? JsonObject ?: return null
        val childUrl = (childProps["url"] as? JsonPrimitive)?.takeIf { it.isString }?.content ?: return null
        val mediaKind = childProps["mediaKind"]
        if (child["type"] != JsonPrimitive("layoutImage") || childProps["collage"] == JsonPrimitive(true) ||
            (mediaKind != null && mediaKind != JsonPrimitive("image")) ||
            !child["content"].isEmptyBlockContent() || !child["children"].isEmptyChildren()
        ) return null
        val photoId = collagePhotoUrl.matchEntire(childUrl)?.groupValues?.get(1) ?: return null
        val id = (child["id"] as? JsonPrimitive)?.takeIf { it.isString && it.content.isNotEmpty() }?.content
        StoredCollagePhoto(id, photoId)
    }
}

private fun JsonElement?.isEmptyChildren() = this == null || this == JsonNull || (this is JsonArray && isEmpty())

private fun JsonElement?.isEmptyBlockContent() = isEmptyChildren() || this == JsonPrimitive("")
