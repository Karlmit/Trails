package com.trails.app.ui.blog

import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextDecoration

/**
 * Real live bold/italic/underline inside a Compose TextField -- typed or
 * pre-existing styled text actually LOOKS bold/italic/underlined while
 * editing, not just marked up with visible delimiter characters (that was
 * v0.8.0/v0.9.0's markdown-shorthand approach; this replaces it).
 *
 * Compose's `TextFieldValue` can carry a styled `AnnotatedString`, and
 * `BasicTextField`/`OutlinedTextField` really do render its spans -- the
 * catch is that the IME only ever reports a plain-text edit (a new
 * `TextFieldValue` whose `annotatedString` has no spans of its own), so
 * *this app* is responsible for figuring out which existing styling
 * survived the edit and reapplying it. [CharStyle] is a per-character
 * bold/italic/underline flag array -- simple, unambiguous, and easy to
 * diff/rebuild against on every keystroke, unlike trying to shift
 * `SpanStyle` `Range`s directly.
 */
data class CharStyle(val bold: Boolean = false, val italic: Boolean = false, val underline: Boolean = false)

fun AnnotatedString.toCharStyles(): Array<CharStyle> {
    val styles = Array(text.length) { CharStyle() }
    for (range in spanStyles) {
        val bold = range.item.fontWeight == FontWeight.Bold
        val italic = range.item.fontStyle == FontStyle.Italic
        val underline = range.item.textDecoration == TextDecoration.Underline
        val end = range.end.coerceAtMost(text.length)
        for (i in range.start until end) {
            styles[i] = CharStyle(
                bold = styles[i].bold || bold,
                italic = styles[i].italic || italic,
                underline = styles[i].underline || underline,
            )
        }
    }
    return styles
}

/** Merges consecutive same-styled characters into `SpanStyle` ranges (the inverse of [toCharStyles]). */
fun buildStyledAnnotatedString(text: String, styles: Array<CharStyle>): AnnotatedString = buildAnnotatedString {
    append(text)
    var i = 0
    while (i < text.length) {
        val current = styles[i]
        var j = i
        while (j < text.length && styles[j] == current) j++
        if (current.bold || current.italic || current.underline) {
            addStyle(
                SpanStyle(
                    fontWeight = if (current.bold) FontWeight.Bold else null,
                    fontStyle = if (current.italic) FontStyle.Italic else null,
                    textDecoration = if (current.underline) TextDecoration.Underline else null,
                ),
                i,
                j,
            )
        }
        i = j
    }
}

fun List<InlineRun>.toAnnotatedString(): AnnotatedString {
    val text = joinToString("") { it.text }
    val styles = Array(text.length) { CharStyle() }
    var offset = 0
    forEach { run ->
        for (i in offset until offset + run.text.length) {
            styles[i] = CharStyle(bold = run.bold, italic = run.italic, underline = run.underline)
        }
        offset += run.text.length
    }
    return buildStyledAnnotatedString(text, styles)
}

fun AnnotatedString.toInlineRuns(): List<InlineRun> {
    if (text.isEmpty()) return listOf(InlineRun(""))
    val styles = toCharStyles()
    val runs = mutableListOf<InlineRun>()
    var i = 0
    while (i < text.length) {
        val current = styles[i]
        var j = i
        while (j < text.length && styles[j] == current) j++
        runs.add(InlineRun(text.substring(i, j), bold = current.bold, italic = current.italic, underline = current.underline))
        i = j
    }
    return runs
}

/**
 * Applies a plain-text edit (as reported by the IME/TextField -- [new]'s
 * `annotatedString` carries no meaningful spans of its own) on top of
 * [old]'s real styling, inserting [activeStyle] on whatever text is newly
 * typed. Deletions and edits in the middle of existing styled text keep
 * the untouched portions' styling intact.
 */
fun mergeTypingEdit(old: TextFieldValue, new: TextFieldValue, activeStyle: CharStyle): TextFieldValue {
    val oldText = old.text
    val newText = new.text
    if (oldText == newText) return new.copy(annotatedString = old.annotatedString)

    val maxPrefix = minOf(oldText.length, newText.length)
    var prefixLen = 0
    while (prefixLen < maxPrefix && oldText[prefixLen] == newText[prefixLen]) prefixLen++

    val maxSuffix = minOf(oldText.length - prefixLen, newText.length - prefixLen)
    var suffixLen = 0
    while (suffixLen < maxSuffix && oldText[oldText.length - 1 - suffixLen] == newText[newText.length - 1 - suffixLen]) suffixLen++

    val oldStyles = old.annotatedString.toCharStyles()
    val newStyles = Array(newText.length) { CharStyle() }
    for (i in 0 until prefixLen) newStyles[i] = oldStyles[i]
    for (i in prefixLen until newText.length - suffixLen) newStyles[i] = activeStyle
    val oldSuffixStart = oldText.length - suffixLen
    for (i in 0 until suffixLen) newStyles[newText.length - suffixLen + i] = oldStyles[oldSuffixStart + i]

    return TextFieldValue(buildStyledAnnotatedString(newText, newStyles), new.selection)
}

/** Toggles [bold]/[italic]/[underline] (whichever is non-null) over the current selection -- if every character in range already has it, clears it; otherwise sets it for all of them. */
fun toggleStyleOnSelection(value: TextFieldValue, bold: Boolean? = null, italic: Boolean? = null, underline: Boolean? = null): TextFieldValue {
    val start = value.selection.min
    val end = value.selection.max
    if (start == end) return value
    val styles = value.annotatedString.toCharStyles()
    val allSet = (start until end).all { i ->
        (bold == null || styles[i].bold) && (italic == null || styles[i].italic) && (underline == null || styles[i].underline)
    }
    for (i in start until end) {
        styles[i] = styles[i].copy(
            bold = if (bold != null) !allSet else styles[i].bold,
            italic = if (italic != null) !allSet else styles[i].italic,
            underline = if (underline != null) !allSet else styles[i].underline,
        )
    }
    return value.copy(annotatedString = buildStyledAnnotatedString(value.text, styles))
}
