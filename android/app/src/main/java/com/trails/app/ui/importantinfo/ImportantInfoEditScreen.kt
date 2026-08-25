package com.trails.app.ui.importantinfo

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import coil3.compose.AsyncImage
import com.trails.app.R
import com.trails.app.ui.components.CheckboxRow
import com.trails.app.ui.components.ErrorBanner
import com.trails.app.ui.components.LabeledField
import com.trails.app.ui.components.LinksEditor
import com.trails.app.ui.components.MultilineLabeledField
import com.trails.app.ui.components.PillButton
import com.trails.app.ui.components.PillButtonVariant
import com.trails.app.ui.components.ScreenHeading
import com.trails.app.ui.components.TagsEditor
import com.trails.app.ui.components.TrailsCard
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.util.openCachedFile
import com.trails.app.util.queryDisplayName
import java.io.File

@Composable
fun ImportantInfoEditScreen(
    padding: PaddingValues,
    onDone: () -> Unit,
    viewModel: ImportantInfoEditViewModel = hiltViewModel(),
    listViewModel: ImportantInfoViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    val items by listViewModel.items.collectAsState(initial = emptyList())
    val attachments by viewModel.attachments.collectAsState()
    val photos by viewModel.photos.collectAsState()
    var showDeleteConfirm by remember { mutableStateOf(false) }
    val context = LocalContext.current

    val pickPhoto = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) viewModel.uploadPhoto(uri, queryDisplayName(context, uri))
    }
    val pickAttachment = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) viewModel.uploadAttachment(uri, queryDisplayName(context, uri))
    }

    LaunchedEffect(items) { viewModel.loadIfEditing(items) }
    LaunchedEffect(state.saved, state.deleted) { if (state.saved || state.deleted) onDone() }

    val scrollState = rememberScrollState()
    LaunchedEffect(state.error) { if (state.error != null) scrollState.animateScrollTo(0) }

    val isNew = state.infoId == null

    Column(
        modifier = Modifier
            .padding(padding)
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        val error = state.error ?: state.errorRes?.let { stringResource(it) }
        error?.let { ErrorBanner(it) }

        TrailsCard {
            ScreenHeading(
                emoji = "📌",
                title = if (isNew) stringResource(R.string.info_edit_title_new) else stringResource(R.string.info_edit_title_edit),
                subtitle = stringResource(R.string.info_edit_subtitle),
            )

            // Deliberately just Title/Description/Private -- user-reported: "too
            // many fields when adding one." Location/contact fields are gone
            // from the UI, but ImportantInfoEditViewModel still loads and
            // resends whatever an existing item already has stored for them
            // (see loadIfEditing/save), so no old data is lost by an edit that
            // never meant to touch them.
            LabeledField(label = stringResource(R.string.info_field_title), value = state.title, onValueChange = viewModel::onTitleChange)
            MultilineLabeledField(label = stringResource(R.string.info_field_description), value = state.content, onValueChange = viewModel::onContentChange)
            LabeledField(label = stringResource(R.string.info_field_emoji), value = state.emoji, onValueChange = viewModel::onEmojiChange)
            CheckboxRow(label = stringResource(R.string.info_field_private), checked = state.isPrivate, onCheckedChange = viewModel::onIsPrivateChange)
            LinksEditor(links = state.links, onAdd = viewModel::addLink, onRemove = viewModel::removeLink)

            // User-requested: Tags/Documents/Photos are only addable once
            // this item exists -- same reasoning as Links above.
            if (!isNew) {
                TagsEditor(tags = state.tags, onAdd = viewModel::addTag, onRemove = viewModel::removeTag)
            }

            if (state.saving) {
                CircularProgressIndicator(modifier = Modifier.padding(top = 4.dp))
            } else {
                PillButton(
                    text = if (isNew) stringResource(R.string.info_action_create) else stringResource(R.string.info_action_save),
                    onClick = viewModel::save,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }

        if (!isNew) {
            TrailsCard {
                ScreenHeading(emoji = "📎", title = stringResource(R.string.info_documents_photos_heading))
                Row(modifier = Modifier.fillMaxWidth()) {
                    Text(
                        stringResource(R.string.info_add_photo),
                        style = MaterialTheme.typography.bodyMedium,
                        color = TrailsColors.BrandAccent,
                        modifier = Modifier.padding(end = 20.dp).clickable {
                            pickPhoto.launch(androidx.activity.result.PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                        },
                    )
                    Text(
                        stringResource(R.string.info_add_document),
                        style = MaterialTheme.typography.bodyMedium,
                        color = TrailsColors.BrandAccent,
                        modifier = Modifier.clickable { pickAttachment.launch(arrayOf("*/*")) },
                    )
                }

                if (photos.isNotEmpty()) {
                    LazyRow {
                        items(photos) { photo ->
                            if (photo.localPath != null) {
                                AsyncImage(
                                    model = File(photo.localPath),
                                    contentDescription = null,
                                    contentScale = ContentScale.Crop,
                                    modifier = Modifier.size(96.dp).padding(end = 8.dp).clip(RoundedCornerShape(4.dp)),
                                )
                            }
                        }
                    }
                }

                if (attachments.isNotEmpty()) {
                    Column {
                        attachments.forEach { attachment ->
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp).clickable {
                                    viewModel.ensureAttachmentCached(attachment) { path -> openCachedFile(context, path, attachment.mimeType) }
                                },
                            ) {
                                Text(attachment.originalFilename, style = MaterialTheme.typography.bodyLarge, color = TrailsColors.BrandAccent)
                            }
                        }
                    }
                }
            }
        }

        if (!isNew && !state.saving) {
            PillButton(
                text = stringResource(R.string.info_action_delete),
                variant = PillButtonVariant.Danger,
                onClick = { showDeleteConfirm = true },
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }

    if (showDeleteConfirm) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirm = false },
            title = { Text(stringResource(R.string.info_delete_dialog_title)) },
            text = { Text(stringResource(R.string.info_delete_dialog_message)) },
            confirmButton = { TextButton(onClick = { showDeleteConfirm = false; viewModel.delete() }) { Text(stringResource(R.string.info_dialog_confirm_delete)) } },
            dismissButton = { TextButton(onClick = { showDeleteConfirm = false }) { Text(stringResource(R.string.info_dialog_cancel)) } },
        )
    }
}
