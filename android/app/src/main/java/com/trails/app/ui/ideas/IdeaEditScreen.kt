package com.trails.app.ui.ideas

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
import com.trails.app.ui.components.CreatableDropdownField
import com.trails.app.ui.components.DropdownField
import com.trails.app.ui.components.ErrorBanner
import com.trails.app.ui.components.LabeledField
import com.trails.app.ui.components.LinksEditor
import com.trails.app.ui.components.MultilineLabeledField
import com.trails.app.ui.components.PillButton
import com.trails.app.ui.components.PillButtonVariant
import com.trails.app.ui.components.ScreenHeading
import com.trails.app.ui.components.TrailsCard
import com.trails.app.ui.sections.SectionsViewModel
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.util.queryDisplayName
import java.io.File

@Composable
fun IdeaEditScreen(
    padding: PaddingValues,
    onDone: () -> Unit,
    viewModel: IdeaEditViewModel = hiltViewModel(),
    ideasViewModel: IdeasViewModel = hiltViewModel(),
    sectionsViewModel: SectionsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    val ideas by ideasViewModel.ideas.collectAsState(initial = emptyList())
    val sections by sectionsViewModel.sections.collectAsState(initial = emptyList())
    val photos by viewModel.photos.collectAsState()
    val categoryOptions by viewModel.categoryOptions.collectAsState()
    val context = LocalContext.current
    var showDeleteConfirm by remember { mutableStateOf(false) }
    var showConvertConfirm by remember { mutableStateOf(false) }

    val pickPhoto = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) viewModel.uploadPhoto(uri, queryDisplayName(context, uri))
    }

    LaunchedEffect(ideas) { viewModel.loadIfEditing(ideas) }
    // Deliberately NOT watching state.saved -- creating an Idea must stay on
    // this screen so Photos/Tags/Links (all add-after-creation-only) become
    // reachable immediately, the same "don't close on create" choice
    // ChecklistEditScreen makes for its own items.
    LaunchedEffect(state.deleted, state.converted) { if (state.deleted || state.converted) onDone() }

    val scrollState = rememberScrollState()
    val errorText = state.error ?: state.errorRes?.let { stringResource(it) }
    // The error banner lives at the very top of a long form -- without
    // this, a validation/network error triggered by a control far down the
    // screen (e.g. "+ Add photo") is invisible unless the user happens to
    // scroll up, which read as "nothing happened" (user-reported).
    LaunchedEffect(errorText) { if (errorText != null) scrollState.animateScrollTo(0) }

    val isNew = state.ideaId == null

    val priorityLabels = IDEA_PRIORITY_LABEL_RES.mapValues { (_, resId) -> stringResource(resId) }
    val weatherLabels = IDEA_WEATHER_LABEL_RES.mapValues { (_, resId) -> stringResource(resId) }

    Column(
        modifier = Modifier
            .padding(padding)
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        errorText?.let { ErrorBanner(it) }

        TrailsCard {
            ScreenHeading(
                emoji = "💡",
                title = if (isNew) stringResource(R.string.idea_edit_title_new) else stringResource(R.string.idea_edit_title_edit),
                subtitle = stringResource(R.string.idea_edit_subtitle),
            )

            LabeledField(label = stringResource(R.string.idea_edit_label_title), value = state.title, onValueChange = viewModel::onTitleChange)

            val sectionOptions = listOf<String?>(null) + sections.map { it.id }
            val noSectionLabel = stringResource(R.string.idea_no_section_label)
            DropdownField(
                label = stringResource(R.string.idea_edit_label_section),
                options = sectionOptions,
                selected = state.sectionId,
                onSelected = viewModel::onSectionChange,
                optionLabel = { id -> sections.find { it.id == id }?.let { "${it.emoji.orEmpty()} ${it.name}".trim() } ?: noSectionLabel },
            )

            CreatableDropdownField(
                label = stringResource(R.string.idea_edit_label_category),
                options = categoryOptions,
                selected = state.category,
                onSelected = viewModel::onCategoryChange,
                onAddOption = viewModel::addCategoryOption,
                onRemoveOption = viewModel::removeCategoryOption,
            )
            MultilineLabeledField(label = stringResource(R.string.idea_edit_label_description), value = state.description, onValueChange = viewModel::onDescriptionChange)
            DropdownField(
                label = stringResource(R.string.idea_edit_label_priority),
                options = IDEA_PRIORITIES,
                selected = state.priority,
                onSelected = viewModel::onPriorityChange,
                optionLabel = { priorityLabels[it] ?: it },
            )
            DropdownField(
                label = stringResource(R.string.idea_edit_label_weather),
                options = IDEA_WEATHER_SUITABILITY,
                selected = state.weatherSuitability,
                onSelected = viewModel::onWeatherSuitabilityChange,
                optionLabel = { weatherLabels[it] ?: it },
            )
            LabeledField(label = stringResource(R.string.idea_edit_label_location_address), value = state.locationAddress, onValueChange = viewModel::onLocationAddressChange)
            LabeledField(label = stringResource(R.string.idea_edit_label_location_map_link), value = state.locationMapLink, onValueChange = viewModel::onLocationMapLinkChange)
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                LabeledField(
                    label = stringResource(R.string.idea_edit_label_expense_amount),
                    value = state.estimatedExpenseAmount,
                    onValueChange = viewModel::onExpenseAmountChange,
                    modifier = Modifier.weight(1f),
                    keyboardType = androidx.compose.ui.text.input.KeyboardType.Decimal,
                )
                LabeledField(
                    label = stringResource(R.string.idea_edit_label_expense_currency),
                    value = state.estimatedExpenseCurrency,
                    onValueChange = viewModel::onExpenseCurrencyChange,
                    modifier = Modifier.weight(1f),
                )
            }

            if (state.saving) {
                CircularProgressIndicator(modifier = Modifier.padding(top = 4.dp))
            } else {
                PillButton(
                    text = if (isNew) stringResource(R.string.idea_edit_button_create) else stringResource(R.string.idea_edit_button_save),
                    onClick = viewModel::save,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }

        TrailsCard {
            ScreenHeading(emoji = "📷", title = stringResource(R.string.idea_edit_cover_photo_heading))
            LazyRow {
                items(photos, key = { it.id }) { photo ->
                    Row(modifier = Modifier.padding(end = 8.dp)) {
                        if (photo.localPath != null) {
                            AsyncImage(
                                model = File(photo.localPath),
                                contentDescription = null,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier
                                    .size(88.dp)
                                    .clip(RoundedCornerShape(8.dp))
                                    .clickable { viewModel.markPhotoPrimary(photo.id) },
                            )
                        }
                    }
                }
                item {
                    if (state.uploadingPhoto) {
                        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, modifier = Modifier.padding(start = 4.dp)) {
                            CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                            Text(stringResource(R.string.idea_edit_uploading_photo), color = TrailsColors.TextSoft, modifier = Modifier.padding(start = 8.dp))
                        }
                    } else {
                        TextButton(onClick = { pickPhoto.launch(androidx.activity.result.PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }) {
                            Text(stringResource(R.string.idea_edit_add_photo))
                        }
                    }
                }
            }
        }

        if (!isNew) {
            // User-requested: Ideas have no Tags at all (redundant with
            // Category).
            TrailsCard {
                ScreenHeading(emoji = "🔗", title = stringResource(R.string.idea_edit_links_heading))
                LinksEditor(links = state.links, onAdd = viewModel::addLink, onRemove = viewModel::removeLink)
            }

            PillButton(
                text = stringResource(R.string.idea_edit_convert_button),
                variant = PillButtonVariant.Outline,
                onClick = { showConvertConfirm = true },
                modifier = Modifier.fillMaxWidth(),
            )
            PillButton(
                text = stringResource(R.string.idea_edit_delete_button),
                variant = PillButtonVariant.Danger,
                onClick = { showDeleteConfirm = true },
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }

    if (showDeleteConfirm) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirm = false },
            title = { Text(stringResource(R.string.idea_edit_delete_dialog_title)) },
            text = { Text(stringResource(R.string.idea_edit_delete_dialog_text)) },
            confirmButton = { TextButton(onClick = { showDeleteConfirm = false; viewModel.delete() }) { Text(stringResource(R.string.idea_edit_delete_confirm_button)) } },
            dismissButton = { TextButton(onClick = { showDeleteConfirm = false }) { Text(stringResource(R.string.idea_edit_delete_cancel_button)) } },
        )
    }

    if (showConvertConfirm) {
        AlertDialog(
            onDismissRequest = { showConvertConfirm = false },
            title = { Text(stringResource(R.string.idea_edit_convert_dialog_title)) },
            text = { Text(stringResource(R.string.idea_edit_convert_dialog_text)) },
            confirmButton = { TextButton(onClick = { showConvertConfirm = false; viewModel.convertToEntry() }) { Text(stringResource(R.string.idea_edit_convert_confirm_button)) } },
            dismissButton = { TextButton(onClick = { showConvertConfirm = false }) { Text(stringResource(R.string.idea_edit_convert_cancel_button)) } },
        )
    }
}
