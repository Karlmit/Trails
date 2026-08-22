package com.trails.app.ui.blog

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * A minimal reader for BlogPost `description`'s BlockNote Block[] JSON --
 * enough to render paragraphs/headings (with real bold/italic/underline,
 * see [InlineRun]) and the app's custom `layoutImage` block
 * (components/RichTextEditor.tsx) as an actual image, without a full
 * BlockNote-equivalent editor/renderer (lists/tables/etc. still just render
 * as their plain text). `layoutImage` stores only `props.url`, a server-
 * relative path shaped `/api/v1/photos/{photoId}/file`
 * (RichTextEditor.tsx's uploadBlogImage) -- the photo id is pulled out of
 * that path and matched against this Blog Post's own already-synced/cached
 * Photos (BlogDetailViewModel), so this works fully offline once the trip
 * has been synced once.
 */
sealed class BlogBlock {
    data class TextBlock(val runs: List<InlineRun>, val level: Int? = null) : BlogBlock()
    data class ImageBlock(val photoId: String) : BlogBlock()
}

private val PHOTO_ID_REGEX = Regex("/api/v1/photos/([^/]+)/file")

fun parseBlogBlocks(raw: String?): List<BlogBlock> {
    if (raw.isNullOrBlank()) return emptyList()
    val parsed = runCatching { Json.parseToJsonElement(raw) }.getOrNull() as? JsonArray
        ?: return listOf(BlogBlock.TextBlock(listOf(InlineRun(raw))))

    val result = mutableListOf<BlogBlock>()
    fun walk(list: JsonArray) {
        for (blockEl in list) {
            val block = blockEl as? JsonObject ?: continue
            val type = (block["type"] as? JsonPrimitive)?.content
            if (type == "layoutImage") {
                val url = ((block["props"] as? JsonObject)?.get("url") as? JsonPrimitive)?.content
                val photoId = url?.let { PHOTO_ID_REGEX.find(it)?.groupValues?.get(1) }
                if (photoId != null) result.add(BlogBlock.ImageBlock(photoId))
            } else {
                val runs = contentToInlineRuns(block["content"])
                if (runs.any { it.text.isNotBlank() }) {
                    val level = if (type == "heading") {
                        ((block["props"] as? JsonObject)?.get("level") as? JsonPrimitive)?.intOrNull ?: 1
                    } else {
                        null
                    }
                    result.add(BlogBlock.TextBlock(runs, level))
                }
            }
            (block["children"] as? JsonArray)?.let { if (it.isNotEmpty()) walk(it) }
        }
    }
    walk(parsed)
    return result
}
