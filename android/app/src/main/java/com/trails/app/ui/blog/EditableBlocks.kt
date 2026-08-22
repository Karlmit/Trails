package com.trails.app.ui.blog

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import java.util.UUID

/** Maps 1:1 onto BlockNote's own block types (lib/entry-types has nothing to do with this -- this is purely RichTextEditor.tsx's schema). */
enum class TextBlockKind { PARAGRAPH, HEADING_1, HEADING_2, HEADING_3, BULLET_LIST, NUMBERED_LIST }

/**
 * The editable half of BlogBlocks.kt's read model -- a flat list of
 * Text/Image blocks a Compose UI can render as actual editable rows
 * (a real live-styled rich text field, see RichTextField.kt / uploaded-
 * image-with-remove-button), matching BlockNote's own flat top-level
 * Block[] shape closely enough to round-trip: a Text block writes back as
 * a real `paragraph`/`heading`/`bulletListItem`/`numberedListItem` block
 * (based on [EditableBlock.Text.kind]), an Image as the app's own custom
 * `layoutImage` block (see RichTextEditor.tsx), so a post edited here
 * still opens correctly in the web editor. List numbering/bullets are
 * computed from position among consecutive same-kind sibling blocks, the
 * same way BlockNote (and HTML `<ol>`/`<ul>`) do it -- no number is stored
 * per block.
 *
 * Bold/italic/underline are real per-character styling (`runs`), not a
 * markdown-shorthand stand-in -- RichTextField.kt's `AnnotatedString`
 * plumbing is what makes that renderable live inside a Compose TextField.
 *
 * Any other BlockNote block type (tables, checklists, code blocks, ...) is
 * NOT modeled individually -- [parseEditableBlocks] flattens each into a
 * plain paragraph (keeping its real inline styling) and reports that it
 * did so via [ParsedEditableContent.lostFormatting].
 */
sealed class EditableBlock {
    data class Text(val id: String, val kind: TextBlockKind, val runs: List<InlineRun>) : EditableBlock()
    data class Image(val id: String, val photoId: String) : EditableBlock()
}

data class ParsedEditableContent(val blocks: List<EditableBlock>, val lostFormatting: Boolean)

data class InlineRun(val text: String, val bold: Boolean = false, val italic: Boolean = false, val underline: Boolean = false)

private val PHOTO_ID_REGEX = Regex("/api/v1/photos/([^/]+)/file")

/** Splits BlockNote's real inline `content` (an array of `{type:"text",text,styles}` runs) into [InlineRun]s. */
fun contentToInlineRuns(content: JsonElement?): List<InlineRun> {
    val runs = mutableListOf<InlineRun>()
    when (content) {
        is JsonPrimitive -> if (content.isString) runs.add(InlineRun(content.content))
        is JsonArray -> for (inline in content) {
            val obj = inline as? JsonObject ?: continue
            val text = (obj["text"] as? JsonPrimitive)?.takeIf { it.isString }?.content ?: continue
            val styles = obj["styles"] as? JsonObject
            runs.add(
                InlineRun(
                    text = text,
                    bold = (styles?.get("bold") as? JsonPrimitive)?.booleanOrNull == true,
                    italic = (styles?.get("italic") as? JsonPrimitive)?.booleanOrNull == true,
                    underline = (styles?.get("underline") as? JsonPrimitive)?.booleanOrNull == true,
                ),
            )
        }
        else -> Unit
    }
    return runs.ifEmpty { listOf(InlineRun("")) }
}

fun parseEditableBlocks(raw: String?): ParsedEditableContent {
    if (raw.isNullOrBlank()) return ParsedEditableContent(emptyList(), lostFormatting = false)
    val parsed = runCatching { Json.parseToJsonElement(raw) }.getOrNull() as? JsonArray
        ?: return ParsedEditableContent(
            listOf(EditableBlock.Text(UUID.randomUUID().toString(), TextBlockKind.PARAGRAPH, listOf(InlineRun(raw)))),
            lostFormatting = false,
        )

    val blocks = mutableListOf<EditableBlock>()
    var lostFormatting = false

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
                "paragraph" -> blocks.add(EditableBlock.Text(id, TextBlockKind.PARAGRAPH, contentToInlineRuns(block["content"])))
                "heading" -> {
                    val level = ((block["props"] as? JsonObject)?.get("level") as? JsonPrimitive)?.intOrNull ?: 1
                    val kind = when (level) {
                        2 -> TextBlockKind.HEADING_2
                        3 -> TextBlockKind.HEADING_3
                        else -> TextBlockKind.HEADING_1
                    }
                    blocks.add(EditableBlock.Text(id, kind, contentToInlineRuns(block["content"])))
                }
                "bulletListItem" -> blocks.add(EditableBlock.Text(id, TextBlockKind.BULLET_LIST, contentToInlineRuns(block["content"])))
                "numberedListItem" -> blocks.add(EditableBlock.Text(id, TextBlockKind.NUMBERED_LIST, contentToInlineRuns(block["content"])))
                else -> {
                    val runs = contentToInlineRuns(block["content"])
                    if (runs.any { it.text.isNotBlank() }) {
                        blocks.add(EditableBlock.Text(id, TextBlockKind.PARAGRAPH, runs))
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
                is EditableBlock.Text -> add(
                    buildJsonObject {
                        put("id", block.id)
                        put(
                            "type",
                            when (block.kind) {
                                TextBlockKind.PARAGRAPH -> "paragraph"
                                TextBlockKind.HEADING_1, TextBlockKind.HEADING_2, TextBlockKind.HEADING_3 -> "heading"
                                TextBlockKind.BULLET_LIST -> "bulletListItem"
                                TextBlockKind.NUMBERED_LIST -> "numberedListItem"
                            },
                        )
                        val level = when (block.kind) {
                            TextBlockKind.HEADING_1 -> 1
                            TextBlockKind.HEADING_2 -> 2
                            TextBlockKind.HEADING_3 -> 3
                            else -> null
                        }
                        if (level != null) {
                            put("props", buildJsonObject { put("level", level) })
                        }
                        putJsonArray("content") {
                            block.runs.filter { it.text.isNotEmpty() }.forEach { run ->
                                add(
                                    buildJsonObject {
                                        put("type", "text")
                                        put("text", run.text)
                                        put(
                                            "styles",
                                            buildJsonObject {
                                                if (run.bold) put("bold", true)
                                                if (run.italic) put("italic", true)
                                                if (run.underline) put("underline", true)
                                            },
                                        )
                                    },
                                )
                            }
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
