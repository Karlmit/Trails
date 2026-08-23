package com.trails.app.ui.blog

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import coil3.compose.AsyncImage
import com.trails.app.ui.components.CheckboxRow
import com.trails.app.ui.components.DatePickerField
import com.trails.app.ui.components.ErrorBanner
import com.trails.app.ui.components.LabeledField
import com.trails.app.ui.components.PillButton
import com.trails.app.ui.components.PillButtonVariant
import com.trails.app.ui.components.ScreenHeading
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.ui.theme.TrailsShapes
import com.trails.app.util.queryDisplayName
import java.io.File

@Composable
fun BlogEditScreen(
    padding: PaddingValues,
    onDone: () -> Unit,
    viewModel: BlogEditViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    val photosById by viewModel.photosById.collectAsState()
    val context = LocalContext.current
    var showDeleteConfirm by remember { mutableStateOf(false) }

    val pickImage = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) viewModel.insertImage(uri, queryDisplayName(context, uri))
    }

    LaunchedEffect(state.saved, state.deleted) { if (state.saved || state.deleted) onDone() }

    val scrollState = rememberScrollState()
    LaunchedEffect(state.error) { if (state.error != null) scrollState.animateScrollTo(0) }

    // Deliberately no TrailsCard wrapper here -- per an earlier, explicit
    // user request ("I would like the blog content editor to be a full
    // page experience"), this stays one continuous writing surface (same
    // choice globals.css's `.blog-editor-form` makes on web), not a boxed
    // panel among several like the other edit screens.
    Column(
        modifier = Modifier
            .padding(padding)
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        ScreenHeading(emoji = "📖", title = if (state.entryId == null) "New blog post" else "Edit blog post")
        state.error?.let { ErrorBanner(it) }
        if (state.lostFormattingWarning) {
            Surface(color = TrailsColors.GoldLightest, shape = TrailsShapes.Input) {
                Text(
                    "This post has formatting (tables, code blocks, ...) from the web editor that this editor doesn't preserve -- saving here will flatten it to plain paragraphs. Text, headings, lists, bold/italic/underline, and images are otherwise kept.",
                    color = TrailsColors.BrandDeep,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(12.dp),
                )
            }
        }

        LabeledField(label = "Title *", value = state.title, onValueChange = viewModel::onTitleChange)
        DatePickerField(label = "Date", isoDate = state.startAt.take(10), onDateChange = { viewModel.onStartAtChange("${it}T00:00:00.000Z") })
        CheckboxRow(label = "Private (only visible to you)", checked = state.isPrivate, onCheckedChange = viewModel::onIsPrivateChange)

        HorizontalDivider()
        Text(
            "Select text and tap B/I/U to format it, or place your cursor and tap one before typing. Use ¶/H1/H2/H3/•/1. to change a block's type.",
            style = MaterialTheme.typography.bodySmall,
            color = TrailsColors.TextSoft,
        )

        // Numbering restarts at 1 whenever a non-numbered block breaks a
        // run of consecutive NUMBERED_LIST blocks -- same as an HTML <ol>,
        // and the same computation BlogScreens.kt's read-only view does.
        val listNumberByBlockId = remember(state.blocks) {
            val map = mutableMapOf<String, Int>()
            var counter = 0
            state.blocks.forEach { b ->
                if (b is EditableBlock.Text && b.kind == TextBlockKind.NUMBERED_LIST) {
                    counter += 1
                    map[b.id] = counter
                } else {
                    counter = 0
                }
            }
            map
        }

        state.blocks.forEach { block ->
            when (block) {
                is EditableBlock.Text -> key(block.id) {
                    TextBlockEditor(
                        block = block,
                        listNumber = listNumberByBlockId[block.id],
                        onRunsChange = { viewModel.updateRuns(block.id, it) },
                        onKindChange = { viewModel.setBlockKind(block.id, it) },
                        onRemove = { viewModel.removeBlock(block.id) },
                        onAddAfter = { viewModel.addTextBlockAfter(block.id) },
                    )
                }
                is EditableBlock.Image -> {
                    val photo = photosById[block.photoId]
                    Column(modifier = Modifier.fillMaxWidth()) {
                        if (photo?.localPath != null) {
                            Row(verticalAlignment = Alignment.Top) {
                                AsyncImage(
                                    model = File(photo.localPath),
                                    contentDescription = null,
                                    contentScale = ContentScale.FillWidth,
                                    modifier = Modifier.weight(1f).clip(RoundedCornerShape(4.dp)),
                                )
                                IconButton(onClick = { viewModel.removeBlock(block.id) }) {
                                    Icon(Icons.Filled.Close, contentDescription = "Remove image")
                                }
                            }
                        } else {
                            Surface(color = TrailsColors.SurfaceCool, shape = TrailsShapes.Input) {
                                Row(modifier = Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                    CircularProgressIndicator(modifier = Modifier.padding(end = 8.dp))
                                    Text("Uploading image…", color = TrailsColors.TextSoft)
                                }
                            }
                        }
                    }
                }
            }
        }

        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = { pickImage.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }, enabled = !state.uploadingImage) {
                Text(if (state.uploadingImage) "Uploading…" else "+ Add image")
            }
        }

        HorizontalDivider()

        if (state.saving) {
            CircularProgressIndicator()
        } else {
            PillButton(text = "Save", onClick = viewModel::save, modifier = Modifier.fillMaxWidth())
            if (state.entryId != null) {
                if (state.isPublished) {
                    PillButton(text = "Unpublish", variant = PillButtonVariant.Outline, onClick = viewModel::unpublish, modifier = Modifier.fillMaxWidth())
                } else {
                    PillButton(text = "Publish", variant = PillButtonVariant.Outline, onClick = viewModel::publish, modifier = Modifier.fillMaxWidth())
                }
                PillButton(text = "Delete post", variant = PillButtonVariant.Danger, onClick = { showDeleteConfirm = true }, modifier = Modifier.fillMaxWidth())
            }
        }
    }

    if (showDeleteConfirm) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirm = false },
            title = { Text("Delete this Blog Post?") },
            text = { Text("This cannot be undone.") },
            confirmButton = { TextButton(onClick = { showDeleteConfirm = false; viewModel.delete() }) { Text("Delete") } },
            dismissButton = { TextButton(onClick = { showDeleteConfirm = false }) { Text("Cancel") } },
        )
    }
}

/**
 * A per-block rich text field with a real B/I/U toolbar -- selected text
 * (or newly typed text, if you tap a button with just a cursor placed)
 * actually renders bold/italic/underline live, via RichTextField.kt's
 * AnnotatedString plumbing. Keeps its own local `TextFieldValue` (styling +
 * selection) in sync with the ViewModel's `List<InlineRun>` source of
 * truth, which is what's actually saved.
 */
@Composable
private fun TextBlockEditor(
    block: EditableBlock.Text,
    listNumber: Int?,
    onRunsChange: (List<InlineRun>) -> Unit,
    onKindChange: (TextBlockKind) -> Unit,
    onRemove: () -> Unit,
    onAddAfter: () -> Unit,
) {
    var fieldValue by remember(block.id) { mutableStateOf(TextFieldValue(block.runs.toAnnotatedString())) }
    val blockPlainText = remember(block.runs) { block.runs.joinToString("") { it.text } }
    if (fieldValue.text != blockPlainText) {
        fieldValue = TextFieldValue(block.runs.toAnnotatedString(), fieldValue.selection)
    }
    // Which style(s) the NEXT typed character will get when the cursor has
    // no selection -- toggled by the B/I/U buttons, and re-synced to
    // whatever's already at the cursor whenever the selection moves so
    // typing continues in the surrounding style by default (matches every
    // other rich text editor's behavior).
    var activeStyle by remember(block.id) { mutableStateOf(CharStyle()) }

    fun styleAtCursor(value: TextFieldValue): CharStyle {
        val pos = value.selection.start
        val styles = value.annotatedString.toCharStyles()
        return styles.getOrNull((pos - 1).coerceAtLeast(0))?.takeIf { pos > 0 } ?: CharStyle()
    }

    fun toggle(bold: Boolean? = null, italic: Boolean? = null, underline: Boolean? = null) {
        if (fieldValue.selection.collapsed) {
            activeStyle = activeStyle.copy(
                bold = if (bold != null) !activeStyle.bold else activeStyle.bold,
                italic = if (italic != null) !activeStyle.italic else activeStyle.italic,
                underline = if (underline != null) !activeStyle.underline else activeStyle.underline,
            )
        } else {
            val toggled = toggleStyleOnSelection(fieldValue, bold, italic, underline)
            fieldValue = toggled
            onRunsChange(toggled.annotatedString.toInlineRuns())
        }
    }

    Column(modifier = Modifier.fillMaxWidth()) {
        Row(modifier = Modifier.fillMaxWidth().padding(bottom = 4.dp)) {
            listOf(
                TextBlockKind.PARAGRAPH to "¶",
                TextBlockKind.HEADING_1 to "H1",
                TextBlockKind.HEADING_2 to "H2",
                TextBlockKind.HEADING_3 to "H3",
                TextBlockKind.BULLET_LIST to "•",
                TextBlockKind.NUMBERED_LIST to "1.",
            ).forEach { (kind, label) ->
                val selected = block.kind == kind
                TextButton(onClick = { onKindChange(kind) }) {
                    Text(
                        label,
                        color = if (selected) TrailsColors.BrandAccent else TrailsColors.TextSoft,
                        style = if (selected) MaterialTheme.typography.labelLarge else MaterialTheme.typography.labelMedium,
                    )
                }
            }
        }
        Row(modifier = Modifier.fillMaxWidth().padding(bottom = 4.dp)) {
            TextButton(onClick = { toggle(bold = true) }) {
                Text(
                    "B",
                    fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
                    color = if (activeStyle.bold) TrailsColors.BrandAccent else TrailsColors.TextSoft,
                )
            }
            TextButton(onClick = { toggle(italic = true) }) {
                Text(
                    "I",
                    fontStyle = androidx.compose.ui.text.font.FontStyle.Italic,
                    color = if (activeStyle.italic) TrailsColors.BrandAccent else TrailsColors.TextSoft,
                )
            }
            TextButton(onClick = { toggle(underline = true) }) {
                Text(
                    "U",
                    textDecoration = androidx.compose.ui.text.style.TextDecoration.Underline,
                    color = if (activeStyle.underline) TrailsColors.BrandAccent else TrailsColors.TextSoft,
                )
            }
        }
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            when (block.kind) {
                TextBlockKind.BULLET_LIST -> Text(
                    "•",
                    style = MaterialTheme.typography.bodyLarge,
                    color = TrailsColors.Text,
                    modifier = Modifier.padding(top = 16.dp, end = 8.dp),
                )
                TextBlockKind.NUMBERED_LIST -> Text(
                    "${listNumber ?: 1}.",
                    style = MaterialTheme.typography.bodyLarge,
                    color = TrailsColors.Text,
                    modifier = Modifier.padding(top = 16.dp, end = 8.dp),
                )
                else -> Unit
            }
            OutlinedTextField(
                value = fieldValue,
                onValueChange = { newValue ->
                    val merged = mergeTypingEdit(fieldValue, newValue, activeStyle)
                    fieldValue = merged
                    activeStyle = styleAtCursor(merged)
                    onRunsChange(merged.annotatedString.toInlineRuns())
                },
                modifier = Modifier.weight(1f),
                minLines = if (block.kind == TextBlockKind.PARAGRAPH) 3 else 1,
                textStyle = when (block.kind) {
                    TextBlockKind.HEADING_1 -> MaterialTheme.typography.headlineMedium
                    TextBlockKind.HEADING_2 -> MaterialTheme.typography.headlineSmall
                    TextBlockKind.HEADING_3 -> MaterialTheme.typography.titleLarge
                    else -> MaterialTheme.typography.bodyLarge
                },
                shape = TrailsShapes.Input,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = TrailsColors.BrandAccent,
                    unfocusedBorderColor = TrailsColors.InputBorder,
                    focusedContainerColor = TrailsColors.Surface,
                    unfocusedContainerColor = TrailsColors.Surface,
                ),
            )
            IconButton(onClick = onRemove) {
                Icon(Icons.Filled.Close, contentDescription = "Remove block")
            }
        }
        val addLabel = when (block.kind) {
            TextBlockKind.BULLET_LIST -> "+ Bullet"
            TextBlockKind.NUMBERED_LIST -> "+ Number"
            else -> "+ Paragraph"
        }
        TextButton(onClick = onAddAfter) { Text(addLabel) }
    }
}
