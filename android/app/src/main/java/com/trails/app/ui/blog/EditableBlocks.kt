package com.trails.app.ui.blog

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import java.util.UUID

/**
 * The editable half of BlogBlocks.kt's read model -- a flat list of
 * Text/Image blocks a Compose UI can render as actual editable rows
 * (multiline text field / uploaded-image-with-remove-button), matching
 * BlockNote's own flat top-level Block[] shape closely enough to round-trip:
 * a Text block writes back as a real `paragraph` or `heading` block (based
 * on [EditableBlock.Text.level]), an Image as the app's own custom
 * `layoutImage` block (see RichTextEditor.tsx), so a post edited here still
 * opens correctly in the web editor.
 *
 * Bold/italic/underline are supported via a markdown-style shorthand typed
 * directly into the text (`**bold**`, `_italic_`, `__underline__`) rather
 * than a tap-to-format toolbar -- Compose's TextField has no reliable way
 * to preserve per-range rich-text spans through live typing without a much
 * larger custom text-editing implementation, so this trades a toolbar for
 * predictable, low-risk syntax that still produces real BlockNote inline
 * styles on save (and is parsed back into the same shorthand when loading
 * existing content, so editing stays consistent). Combining two styles on
 * the same run (e.g. bold *and* italic together) isn't supported -- each
 * run is plain, bold, italic, or underline, not a combination.
 *
 * Any other BlockNote block type (lists, tables, ...) is NOT modeled
 * individually -- [parseEditableBlocks] flattens each into a plain Text
 * block and reports that it did so via [ParsedEditableContent.lostFormatting].
 */
sealed class EditableBlock {
    /** [level] null = paragraph, 1/2/3 = heading. [text] carries the markdown-shorthand styling described above. */
    data class Text(val id: String, val level: Int?, val text: String) : EditableBlock()
    data class Image(val id: String, val photoId: String) : EditableBlock()
}

data class ParsedEditableContent(val blocks: List<EditableBlock>, val lostFormatting: Boolean)

data class InlineRun(val text: String, val bold: Boolean = false, val italic: Boolean = false, val underline: Boolean = false)

private val PHOTO_ID_REGEX = Regex("/api/v1/photos/([^/]+)/file")
private val STYLE_TOKEN_REGEX = Regex("\\*\\*(.+?)\\*\\*|__(.+?)__|_(.+?)_")

/** Splits BlockNote's real inline `content` (an array of `{type:"text",text,styles}` runs) into [InlineRun]s. */
fun contentToInlineRuns(content: kotlinx.serialization.json.JsonElement?): List<InlineRun> {
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
    return runs
}

fun InlineRun.toMarkdown(): String = when {
    bold -> "**$text**"
    underline -> "__${text}__"
    italic -> "_${text}_"
    else -> text
}

fun List<InlineRun>.toMarkdownString(): String = joinToString("") { it.toMarkdown() }

/** Parses the markdown-shorthand described in this file's class comment back into real styled runs. */
fun parseMarkdownRuns(markdown: String): List<InlineRun> {
    val runs = mutableListOf<InlineRun>()
    var lastEnd = 0
    for (match in STYLE_TOKEN_REGEX.findAll(markdown)) {
        if (match.range.first > lastEnd) runs.add(InlineRun(markdown.substring(lastEnd, match.range.first)))
        val bold = match.groups[1]?.value
        val underline = match.groups[2]?.value
        val italic = match.groups[3]?.value
        when {
            bold != null -> runs.add(InlineRun(bold, bold = true))
            underline != null -> runs.add(InlineRun(underline, underline = true))
            italic != null -> runs.add(InlineRun(italic, italic = true))
        }
        lastEnd = match.range.last + 1
    }
    if (lastEnd < markdown.length) runs.add(InlineRun(markdown.substring(lastEnd)))
    return runs
}

fun parseEditableBlocks(raw: String?): ParsedEditableContent {
    if (raw.isNullOrBlank()) return ParsedEditableContent(emptyList(), lostFormatting = false)
    val parsed = runCatching { Json.parseToJsonElement(raw) }.getOrNull() as? JsonArray
        ?: return ParsedEditableContent(listOf(EditableBlock.Text(UUID.randomUUID().toString(), null, raw)), lostFormatting = false)

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
                "paragraph" -> blocks.add(EditableBlock.Text(id, null, contentToInlineRuns(block["content"]).toMarkdownString()))
                "heading" -> {
                    val level = ((block["props"] as? JsonObject)?.get("level") as? JsonPrimitive)?.intOrNull ?: 1
                    blocks.add(EditableBlock.Text(id, level, contentToInlineRuns(block["content"]).toMarkdownString()))
                }
                else -> {
                    val text = contentToInlineRuns(block["content"]).toMarkdownString()
                    if (text.isNotBlank()) {
                        blocks.add(EditableBlock.Text(id, null, text))
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
                        put("type", if (block.level == null) "paragraph" else "heading")
                        if (block.level != null) {
                            put("props", buildJsonObject { put("level", block.level) })
                        }
                        putJsonArray("content") {
                            parseMarkdownRuns(block.text).forEach { run ->
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
