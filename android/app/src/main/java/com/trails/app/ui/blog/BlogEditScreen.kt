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

    Column(
        modifier = Modifier
            .padding(padding)
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        state.error?.let { ErrorBanner(it) }
        if (state.lostFormattingWarning) {
            Text(
                "This post has formatting (lists, tables, ...) from the web editor that this editor doesn't preserve -- saving here will flatten it to plain paragraphs. Text, headings, bold/italic/underline, and images are otherwise kept.",
                color = TrailsColors.TextSoft,
                style = MaterialTheme.typography.bodySmall,
            )
        }

        LabeledField(label = "Title *", value = state.title, onValueChange = viewModel::onTitleChange)
        DatePickerField(label = "Date", isoDate = state.startAt.take(10), onDateChange = { viewModel.onStartAtChange("${it}T00:00:00.000Z") })
        CheckboxRow(label = "Private (only visible to you)", checked = state.isPrivate, onCheckedChange = viewModel::onIsPrivateChange)

        HorizontalDivider()
        Text(
            "Select text and tap B/I/U to format it, or place your cursor and tap one before typing. Use ¶/H1/H2/H3 to change a block's heading level.",
            style = MaterialTheme.typography.bodySmall,
            color = TrailsColors.TextSoft,
        )

        state.blocks.forEach { block ->
            when (block) {
                is EditableBlock.Text -> key(block.id) {
                    TextBlockEditor(
                        block = block,
                        onRunsChange = { viewModel.updateRuns(block.id, it) },
                        onLevelChange = { viewModel.setBlockLevel(block.id, it) },
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
            PillButton(text = "Save", onClick = viewModel::save)
            if (state.entryId != null) {
                if (state.isPublished) {
                    PillButton(text = "Unpublish", variant = PillButtonVariant.Outline, onClick = viewModel::unpublish)
                } else {
                    PillButton(text = "Publish", variant = PillButtonVariant.Outline, onClick = viewModel::publish)
                }
                PillButton(text = "Delete Post", variant = PillButtonVariant.Danger, onClick = { showDeleteConfirm = true })
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
    onRunsChange: (List<InlineRun>) -> Unit,
    onLevelChange: (Int?) -> Unit,
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
            listOf(null to "¶", 1 to "H1", 2 to "H2", 3 to "H3").forEach { (level, label) ->
                val selected = block.level == level
                TextButton(onClick = { onLevelChange(level) }) {
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
            OutlinedTextField(
                value = fieldValue,
                onValueChange = { newValue ->
                    val merged = mergeTypingEdit(fieldValue, newValue, activeStyle)
                    fieldValue = merged
                    activeStyle = styleAtCursor(merged)
                    onRunsChange(merged.annotatedString.toInlineRuns())
                },
                modifier = Modifier.weight(1f),
                minLines = if (block.level == null) 3 else 1,
                textStyle = when (block.level) {
                    1 -> MaterialTheme.typography.headlineMedium
                    2 -> MaterialTheme.typography.headlineSmall
                    3 -> MaterialTheme.typography.titleLarge
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
        TextButton(onClick = onAddAfter) { Text("+ Paragraph") }
    }
}
