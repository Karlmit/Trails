package com.trails.app.ui.blog

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.text.format.Formatter
import androidx.core.content.ContextCompat
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.hilt.navigation.compose.hiltViewModel
import coil3.compose.AsyncImage
import com.trails.app.R
import com.trails.app.ui.components.CheckboxRow
import com.trails.app.ui.components.DatePickerField
import com.trails.app.ui.components.ErrorBanner
import com.trails.app.ui.components.LabeledField
import com.trails.app.ui.components.PillButton
import com.trails.app.ui.components.PillButtonVariant
import com.trails.app.ui.components.ScreenHeading
import com.trails.app.ui.components.UrlImportDialog
import com.trails.app.ui.documents.DocumentViewerScreen
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.ui.theme.TrailsShapes
import com.trails.app.util.queryDisplayName
import java.io.File

@Composable
fun BlogEditScreen(
    padding: PaddingValues,
    onOpenPhoto: (String) -> Unit,
    onDone: () -> Unit,
    viewModel: BlogEditViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    val photosById by viewModel.photosById.collectAsState()
    val view = LocalView.current
    DisposableEffect(view, state.publishing) {
        val previous = view.keepScreenOn
        if (state.publishing) view.keepScreenOn = true
        onDispose { if (state.publishing) view.keepScreenOn = previous }
    }
    val context = LocalContext.current
    var askedForNotifications by rememberSaveable { mutableStateOf(false) }
    val requestNotifications = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}

    var showDiscardConfirm by remember { mutableStateOf(false) }
    var showDeleteConfirm by remember { mutableStateOf(false) }
    var pickerAfterId by rememberSaveable { mutableStateOf<String?>(null) }
    var urlAfterId by rememberSaveable { mutableStateOf<String?>(null) }
    var localPreviewId by rememberSaveable { mutableStateOf<String?>(null) }

    val pickImages = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia()) { uris ->
        viewModel.insertImages(uris, { uri -> queryDisplayName(context, uri) }, pickerAfterId)
        pickerAfterId = null
    }

    LaunchedEffect(state.saved, state.deleted) { if (state.saved || state.deleted) onDone() }

    val scrollState = rememberScrollState()
    val drag = remember { BlogBlockDrag() }
    AutoScrollBlogDrag(drag, scrollState)
    val dropBeforeId = if (drag.draggedId != null) drag.beforeId(state.blocks) else null
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
            .onGloballyPositioned { drag.viewport = it }
            .verticalScroll(scrollState)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        ScreenHeading(
            emoji = "📖",
            title = if (state.entryId == null) stringResource(R.string.blog_new_post_title) else stringResource(R.string.blog_edit_post_title),
        )
        state.error?.let { error ->
            val message = when (error) {
                is BlogEditError.Message -> error.text
                is BlogEditError.Resource -> stringResource(error.resId)
                is BlogEditError.PublishFailure -> {
                    val detail = error.reason ?: error.reasonRes?.let { stringResource(it) }
                        ?: error.httpStatus?.let { stringResource(R.string.blog_publish_http_error, it) }
                    listOfNotNull(
                        stringResource(R.string.blog_error_publish_retry),
                        error.photoName?.let { stringResource(R.string.blog_publish_photo_error, it) },
                        detail,
                    ).joinToString("\n")
                }
                is BlogEditError.ImageBatch -> {
                    val fallback = stringResource(R.string.blog_error_stage_image)
                    val details = error.failures.joinToString("\n") { "${it.filename} — ${it.reason ?: fallback}" }
                    stringResource(R.string.blog_error_stage_image_batch, error.failures.size, details)
                }
            }
            ErrorBanner(message)
        }
        if (!state.ready) {
            if (state.error == null) CircularProgressIndicator()
            return@Column
        }
        if (state.lostFormattingWarning) {
            Surface(color = TrailsColors.BrandMint, shape = TrailsShapes.Input) {
                Text(
                    stringResource(R.string.blog_lost_formatting_warning),
                    color = TrailsColors.BrandDeep,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(12.dp),
                )
            }
        }

        LabeledField(label = stringResource(R.string.blog_title_label), value = state.title, onValueChange = viewModel::onTitleChange)
        DatePickerField(label = stringResource(R.string.blog_date_label), isoDate = state.startAt.take(10), onDateChange = { viewModel.onStartAtChange("${it}T00:00:00.000Z") })
        CheckboxRow(label = stringResource(R.string.blog_private_label), checked = state.isPrivate, onCheckedChange = viewModel::onIsPrivateChange)

        HorizontalDivider()
        Text(
            stringResource(R.string.blog_formatting_hint),
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

        state.blocks.forEachIndexed { index, block ->
            key(block.id) {
                DisposableEffect(block.id) {
                    onDispose { drag.centers.remove(block.id) }
                }
                val moved = drag.draggedId == block.id
                val showDropLine = drag.draggedId != null && dropBeforeId == block.id
                val showEndLine = drag.draggedId != null && dropBeforeId == null && index == state.blocks.lastIndex
                Column(
                    Modifier.fillMaxWidth()
                        .onGloballyPositioned { drag.updateCenter(block.id, it) }
                        .drawBehind {
                            if (showDropLine || showEndLine) {
                                val width = 3.dp.toPx()
                                val y = if (showEndLine) size.height - width / 2f else width / 2f
                                drawLine(TrailsColors.BrandAccent, Offset(0f, y), Offset(size.width, y), width)
                            }
                        }
                        .alpha(if (moved) 0.55f else 1f),
                ) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                        BlogBlockDragHandle(
                            id = block.id,
                            drag = drag,
                            enabled = !state.saving && !state.stagingImages,
                            onDrop = { viewModel.moveBlockBefore(block.id, drag.beforeId(state.blocks)) },
                            onMoveUp = state.blocks.getOrNull(index - 1)?.let { previous ->
                                { viewModel.moveBlockBefore(block.id, previous.id) }
                            },
                            onMoveDown = if (index < state.blocks.lastIndex) {
                                { viewModel.moveBlockBefore(block.id, state.blocks.getOrNull(index + 2)?.id) }
                            } else null,
                        )
                    }
                    when (block) {
                        is EditableBlock.Text -> TextBlockEditor(
                            block = block,
                            listNumber = listNumberByBlockId[block.id],
                            onRunsChange = { viewModel.updateRuns(block.id, it) },
                            onKindChange = { viewModel.setBlockKind(block.id, it) },
                            onRemove = { viewModel.removeBlock(block.id) },
                            removeEnabled = !state.saving && !state.stagingImages,
                            editable = !state.saving,
                        )
                        is EditableBlock.Image -> {
                            val staged = state.pendingPhotos[block.id]
                            val remote = photosById[block.photoId]
                            val file = staged?.let(viewModel::localPhoto) ?: remote?.localPath?.let(::File)
                            val label = staged?.filename ?: remote?.originalFilename
                                ?: stringResource(R.string.blog_image_unavailable)
                            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                                if (block.isVideo) {
                                    TextButton(
                                        onClick = { if (staged != null) localPreviewId = block.id else onOpenPhoto(block.photoId) },
                                        enabled = file != null || remote != null,
                                        modifier = Modifier.weight(1f),
                                    ) { Text(stringResource(R.string.blog_play_video, label)) }
                                } else if (file != null) {
                                    AsyncImage(
                                        model = file,
                                        contentDescription = label,
                                        contentScale = ContentScale.FillWidth,
                                        modifier = Modifier.weight(1f).clip(RoundedCornerShape(4.dp)).clickable {
                                            if (staged != null) localPreviewId = block.id
                                            else onOpenPhoto(block.photoId)
                                        },
                                    )
                                } else {
                                    Column(Modifier.weight(1f).padding(8.dp)) {
                                        Text(
                                            label,
                                            color = TrailsColors.BrandAccent,
                                            modifier = if (remote != null) Modifier.clickable { onOpenPhoto(remote.id) } else Modifier,
                                        )
                                        if (staged?.sourceUrl != null) {
                                            Text(stringResource(R.string.blog_image_url_queued), style = MaterialTheme.typography.bodySmall)
                                        }
                                    }
                                }
                                IconButton(
                                    onClick = { viewModel.removeBlock(block.id) },
                                    enabled = !state.saving && !state.stagingImages,
                                ) {
                                    Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.blog_remove_image_desc))
                                }
                            }
                        }
                    }
                    BlogBlockInsertion(
                        kind = (block as? EditableBlock.Text)?.kind,
                        paragraphEnabled = !state.saving,
                        imagesEnabled = !state.stagingImages && !state.saving,
                        onAddParagraph = { viewModel.addTextBlockAfter(block.id) },
                        onPickImages = {
                            pickerAfterId = block.id
                            pickImages.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageAndVideo))
                        },
                        onImageUrl = { urlAfterId = block.id },
                    )
                }
            }
        }
        if (state.stagingImages) {
            Text(stringResource(R.string.blog_staging_images), color = TrailsColors.TextSoft)
        }

        HorizontalDivider()

        if (state.saving) {
            if (state.publishing) {
                BlogPublishStatus(state.uploadProgress)
            } else {
                CircularProgressIndicator()
            }
        } else {
            PillButton(
                text = stringResource(if (state.isPublished) R.string.blog_publish_changes else R.string.blog_publish_button),
                onClick = {
                    viewModel.publish()
                    if (viewModel.state.value.publishing && !askedForNotifications &&
                        Build.VERSION.SDK_INT >= 33 &&
                        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                    ) {
                        askedForNotifications = true
                        requestNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = !state.stagingImages,
            )
            PillButton(
                text = stringResource(R.string.blog_save_device),
                variant = PillButtonVariant.Outline,
                onClick = viewModel::save,
                modifier = Modifier.fillMaxWidth(),
                enabled = !state.stagingImages,
            )
            if (state.isPublished) {
                PillButton(text = stringResource(R.string.blog_unpublish_button), variant = PillButtonVariant.Outline, onClick = viewModel::unpublish, modifier = Modifier.fillMaxWidth(), enabled = !state.stagingImages)
                PillButton(
                    text = stringResource(R.string.blog_delete_post_button),
                    variant = PillButtonVariant.Danger,
                    onClick = { showDeleteConfirm = true },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !state.stagingImages,
                )
            }
            PillButton(
                text = stringResource(R.string.blog_discard_draft),
                variant = PillButtonVariant.Outline,
                onClick = { showDiscardConfirm = true },
                modifier = Modifier.fillMaxWidth(),
                enabled = !state.stagingImages,
            )
        }
    }

    localPreviewId?.let { id ->
        val photo = state.pendingPhotos[id]
        val file = photo?.let(viewModel::localPhoto)
        if (file != null && photo.mimeType != null) {
            Dialog(onDismissRequest = { localPreviewId = null }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
                DocumentViewerScreen(
                    localPath = file.absolutePath,
                    mimeType = photo.mimeType,
                    filename = photo.filename,
                    onBack = { localPreviewId = null },
                )
            }
        }
    }

    urlAfterId?.let { afterId ->
        UrlImportDialog(
            title = stringResource(R.string.url_import_photo_title),
            onDismiss = { urlAfterId = null },
            onConfirm = { url ->
                urlAfterId = null
                viewModel.insertImageFromUrl(url, afterId)
            },
        )
    }

    if (showDiscardConfirm) {
        AlertDialog(
            onDismissRequest = { showDiscardConfirm = false },
            title = { Text(stringResource(R.string.blog_discard_draft)) },
            text = { Text(stringResource(R.string.blog_delete_confirm_text)) },
            confirmButton = { TextButton(onClick = { showDiscardConfirm = false; viewModel.discardDraft() }) { Text(stringResource(R.string.blog_delete_confirm_button)) } },
            dismissButton = { TextButton(onClick = { showDiscardConfirm = false }) { Text(stringResource(R.string.blog_cancel_button)) } },
        )
    }

    if (showDeleteConfirm) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirm = false },
            title = { Text(stringResource(R.string.blog_delete_confirm_title)) },
            text = { Text(stringResource(R.string.blog_delete_confirm_text)) },
            confirmButton = { TextButton(onClick = { showDeleteConfirm = false; viewModel.deletePost() }) { Text(stringResource(R.string.blog_delete_confirm_button)) } },
            dismissButton = { TextButton(onClick = { showDeleteConfirm = false }) { Text(stringResource(R.string.blog_cancel_button)) } },
        )
    }
}

@Composable
private fun BlogPublishStatus(progress: BlogUploadProgress?) {
    val context = LocalContext.current
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (progress == null) {
            Text(stringResource(R.string.blog_publishing))
            LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
        } else {
            Text(stringResource(R.string.blog_upload_photo_count, progress.completedPhotos, progress.totalPhotos))
            LinearProgressIndicator(progress = { progress.fraction }, modifier = Modifier.fillMaxWidth())
            if (progress.totalBytes > 0) {
                Text(
                    stringResource(
                        R.string.blog_upload_bytes,
                        Formatter.formatShortFileSize(context, progress.sentBytes),
                        Formatter.formatShortFileSize(context, progress.totalBytes),
                    ),
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            if (progress.retryingSmaller) {
                Text(stringResource(R.string.blog_upload_smaller_photo), style = MaterialTheme.typography.bodySmall)
            }
            val seconds = progress.remainingSeconds
            val detail = when {
                progress.completedPhotos == progress.totalPhotos -> stringResource(R.string.blog_upload_finalizing)
                progress.importingUrl -> stringResource(R.string.blog_upload_importing)
                seconds != null && seconds >= 60 -> stringResource(R.string.blog_upload_minutes, (seconds.toLong() + 59) / 60)
                seconds != null -> stringResource(R.string.blog_upload_seconds, seconds)
                progress.currentPhotoFraction >= 0.99f -> stringResource(R.string.blog_upload_confirming)
                else -> null
            }
            detail?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
        }
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
    removeEnabled: Boolean,
    editable: Boolean,
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
                TextButton(onClick = { onKindChange(kind) }, enabled = editable) {
                    Text(
                        label,
                        color = if (selected) TrailsColors.BrandAccent else TrailsColors.TextSoft,
                        style = if (selected) MaterialTheme.typography.labelLarge else MaterialTheme.typography.labelMedium,
                    )
                }
            }
        }
        Row(modifier = Modifier.fillMaxWidth().padding(bottom = 4.dp)) {
            TextButton(onClick = { toggle(bold = true) }, enabled = editable) {
                Text(
                    "B",
                    fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
                    color = if (activeStyle.bold) TrailsColors.BrandAccent else TrailsColors.TextSoft,
                )
            }
            TextButton(onClick = { toggle(italic = true) }, enabled = editable) {
                Text(
                    "I",
                    fontStyle = androidx.compose.ui.text.font.FontStyle.Italic,
                    color = if (activeStyle.italic) TrailsColors.BrandAccent else TrailsColors.TextSoft,
                )
            }
            TextButton(onClick = { toggle(underline = true) }, enabled = editable) {
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
                readOnly = !editable,
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
                    focusedContainerColor = TrailsColors.SurfaceCool,
                    unfocusedContainerColor = TrailsColors.SurfaceCool,
                ),
            )
            IconButton(onClick = onRemove, enabled = removeEnabled) {
                Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.blog_remove_block_desc))
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun BlogBlockInsertion(
    kind: TextBlockKind?,
    paragraphEnabled: Boolean,
    imagesEnabled: Boolean,
    onAddParagraph: () -> Unit,
    onPickImages: () -> Unit,
    onImageUrl: () -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val addLabel = when (kind) {
        TextBlockKind.BULLET_LIST -> R.string.blog_add_bullet
        TextBlockKind.NUMBERED_LIST -> R.string.blog_add_number
        else -> R.string.blog_add_paragraph
    }
    FlowRow(modifier = Modifier.fillMaxWidth()) {
        TextButton(onClick = onAddParagraph, enabled = paragraphEnabled) { Text(stringResource(addLabel)) }
        Box {
            TextButton(onClick = { expanded = true }, enabled = imagesEnabled) {
                Text(stringResource(R.string.blog_add_image))
            }
            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.blog_pick_images)) },
                    onClick = { expanded = false; onPickImages() },
                )
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.blog_image_from_url)) },
                    onClick = { expanded = false; onImageUrl() },
                )
            }
        }
    }
}
