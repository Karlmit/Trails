package com.trails.app.ui.blog

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import java.util.UUID

/**
 * The editable half of BlogBlocks.kt's read model -- a flat list of
 * Paragraph/Image blocks a Compose UI can render as actual editable rows
 * (multiline text field / uploaded-image-with-remove-button), matching
 * BlockNote's own flat top-level Block[] shape closely enough to round-trip:
 * a Paragraph writes back as a real `paragraph` block, an Image as the
 * app's own custom `layoutImage` block (see RichTextEditor.tsx), so a post
 * edited here still opens correctly in the web editor.
 *
 * Headings, lists, and any other BlockNote block type are NOT modeled
 * individually -- [parseEditableBlocks] flattens each into a plain
 * Paragraph (same plain-text extraction as extractPlainText) and reports
 * that it did so via [ParsedEditableContent.lostFormatting], so the editor
 * can warn once rather than silently discarding a heading/list on save.
 */
sealed class EditableBlock {
    data class Paragraph(val id: String, val text: String) : EditableBlock()
    data class Image(val id: String, val photoId: String) : EditableBlock()
}

data class ParsedEditableContent(val blocks: List<EditableBlock>, val lostFormatting: Boolean)

private val PHOTO_ID_REGEX = Regex("/api/v1/photos/([^/]+)/file")

fun parseEditableBlocks(raw: String?): ParsedEditableContent {
    if (raw.isNullOrBlank()) return ParsedEditableContent(emptyList(), lostFormatting = false)
    val parsed = runCatching { Json.parseToJsonElement(raw) }.getOrNull() as? JsonArray
        ?: return ParsedEditableContent(listOf(EditableBlock.Paragraph(UUID.randomUUID().toString(), raw)), lostFormatting = false)

    val blocks = mutableListOf<EditableBlock>()
    var lostFormatting = false

    fun textOf(block: JsonObject): String = buildString {
        when (val content = block["content"]) {
            is JsonPrimitive -> if (content.isString) append(content.content)
            is JsonArray -> for (inline in content) {
                val text = (inline as? JsonObject)?.get("text") as? JsonPrimitive
                if (text != null && text.isString) append(text.content)
            }
            else -> Unit
        }
    }

    fun walk(list: JsonArray) {
        for (blockEl in list) {
            val block = blockEl as? JsonObject ?: continue
            val type = (block["type"] as? JsonPrimitive)?.content
            val id = (block["id"] as? JsonPrimitive)?.content ?: UUID.randomUUID().toString()
            when (type) {
                "layoutImage" -> {
                    val url = ((block["props"] as? JsonObject)?.get("url") as? JsonPrimitive)?.content
                    val photoId = url?.let { PHOTO_ID_REGEX.find(it)?.groupValues?.get(1) }
                    if (photoId != null) blocks.add(EditableBlock.Image(id, photoId))
                }
                "paragraph" -> blocks.add(EditableBlock.Paragraph(id, textOf(block)))
                else -> {
                    val text = textOf(block)
                    if (text.isNotBlank()) {
                        blocks.add(EditableBlock.Paragraph(id, text))
                        lostFormatting = true
                    }
                }
            }
            (block["children"] as? JsonArray)?.let { if (it.isNotEmpty()) walk(it) }
        }
    }
    walk(parsed)
    return ParsedEditableContent(blocks, lostFormatting)
}

/** The exact BlockNote Block[] shape RichTextEditor.tsx's own editor.document produces, minus any formatting this editor doesn't model (see the class comment above). */
fun encodeEditableBlocks(blocks: List<EditableBlock>): String {
    val array = buildJsonArray {
        blocks.forEach { block ->
            when (block) {
                is EditableBlock.Paragraph -> add(
                    buildJsonObject {
                        put("id", block.id)
                        put("type", "paragraph")
                        putJsonArray("content") {
                            add(
                                buildJsonObject {
                                    put("type", "text")
                                    put("text", block.text)
                                    put("styles", buildJsonObject { })
                                },
                            )
                        }
                        putJsonArray("children") {}
                    },
                )
                is EditableBlock.Image -> add(
                    buildJsonObject {
                        put("id", block.id)
                        put("type", "layoutImage")
                        put(
                            "props",
                            buildJsonObject {
                                put("url", "/api/v1/photos/${block.photoId}/file")
                                put("layout", "block")
                            },
                        )
                        putJsonArray("children") {}
                    },
                )
            }
        }
    }
    return Json.encodeToString(JsonArray.serializer(), array)
}
