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
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import coil3.compose.AsyncImage
import com.trails.app.ui.components.CreatableDropdownField
import com.trails.app.ui.components.DropdownField
import com.trails.app.ui.components.ErrorBanner
import com.trails.app.ui.components.LabeledField
import com.trails.app.ui.components.LinksEditor
import com.trails.app.ui.components.PillButton
import com.trails.app.ui.components.PillButtonVariant
import com.trails.app.ui.components.ScreenHeading
import com.trails.app.ui.components.TagsEditor
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
    // The error banner lives at the very top of a long form -- without
    // this, a validation/network error triggered by a control far down the
    // screen (e.g. "+ Add photo") is invisible unless the user happens to
    // scroll up, which read as "nothing happened" (user-reported).
    LaunchedEffect(state.error) { if (state.error != null) scrollState.animateScrollTo(0) }

    val isNew = state.ideaId == null

    Column(
        modifier = Modifier
            .padding(padding)
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        state.error?.let { ErrorBanner(it) }

        TrailsCard {
            ScreenHeading(
                emoji = "💡",
                title = if (isNew) "New idea" else "Edit idea",
                subtitle = "Something worth doing on this trip -- pin it here before you forget.",
            )

            LabeledField(label = "Title *", value = state.title, onValueChange = viewModel::onTitleChange)

            val sectionOptions = listOf<String?>(null) + sections.map { it.id }
            DropdownField(
                label = "Section",
                options = sectionOptions,
                selected = state.sectionId,
                onSelected = viewModel::onSectionChange,
                optionLabel = { id -> sections.find { it.id == id }?.let { "${it.emoji.orEmpty()} ${it.name}".trim() } ?: "No Section" },
            )

            CreatableDropdownField(
                label = "Category",
                options = categoryOptions,
                selected = state.category,
                onSelected = viewModel::onCategoryChange,
                onAddOption = viewModel::addCategoryOption,
                onRemoveOption = viewModel::removeCategoryOption,
            )
            DropdownField(
                label = "Priority",
                options = IDEA_PRIORITIES,
                selected = state.priority,
                onSelected = viewModel::onPriorityChange,
                optionLabel = { IDEA_PRIORITY_LABELS[it] ?: it },
            )
            DropdownField(
                label = "Weather suitability",
                options = IDEA_WEATHER_SUITABILITY,
                selected = state.weatherSuitability,
                onSelected = viewModel::onWeatherSuitabilityChange,
                optionLabel = { IDEA_WEATHER_LABELS[it] ?: it },
            )
            LabeledField(label = "Location address", value = state.locationAddress, onValueChange = viewModel::onLocationAddressChange)
            LabeledField(label = "Google Maps link", value = state.locationMapLink, onValueChange = viewModel::onLocationMapLinkChange)
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                LabeledField(
                    label = "Est. expense",
                    value = state.estimatedExpenseAmount,
                    onValueChange = viewModel::onExpenseAmountChange,
                    modifier = Modifier.weight(1f),
                    keyboardType = androidx.compose.ui.text.input.KeyboardType.Decimal,
                )
                LabeledField(
                    label = "Currency",
                    value = state.estimatedExpenseCurrency,
                    onValueChange = viewModel::onExpenseCurrencyChange,
                    modifier = Modifier.weight(1f),
                )
            }

            if (state.saving) {
                CircularProgressIndicator(modifier = Modifier.padding(top = 4.dp))
            } else {
                PillButton(
                    text = if (isNew) "Create idea" else "Save changes",
                    onClick = viewModel::save,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }

        TrailsCard {
            ScreenHeading(emoji = "📷", title = "Cover photo")
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
                            Text("Uploading…", color = TrailsColors.TextSoft, modifier = Modifier.padding(start = 8.dp))
                        }
                    } else {
                        TextButton(onClick = { pickPhoto.launch(androidx.activity.result.PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }) {
                            Text("+ Add photo")
                        }
                    }
                }
            }
        }

        if (!isNew) {
            TrailsCard {
                ScreenHeading(emoji = "🏷️", title = "Tags & links")
                TagsEditor(tags = state.tags, onAdd = viewModel::addTag, onRemove = viewModel::removeTag)
                LinksEditor(links = state.links, onAdd = viewModel::addLink, onRemove = viewModel::removeLink)
            }

            PillButton(
                text = "Convert to Timeline Entry",
                variant = PillButtonVariant.Outline,
                onClick = { showConvertConfirm = true },
                modifier = Modifier.fillMaxWidth(),
            )
            PillButton(
                text = "Delete idea",
                variant = PillButtonVariant.Danger,
                onClick = { showDeleteConfirm = true },
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }

    if (showDeleteConfirm) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirm = false },
            title = { Text("Delete this Idea?") },
            text = { Text("This cannot be undone.") },
            confirmButton = { TextButton(onClick = { showDeleteConfirm = false; viewModel.delete() }) { Text("Delete") } },
            dismissButton = { TextButton(onClick = { showDeleteConfirm = false }) { Text("Cancel") } },
        )
    }

    if (showConvertConfirm) {
        AlertDialog(
            onDismissRequest = { showConvertConfirm = false },
            title = { Text("Convert to Timeline Entry?") },
            text = { Text("This Idea will become a real Timeline Entry and disappear from Ideas.") },
            confirmButton = { TextButton(onClick = { showConvertConfirm = false; viewModel.convertToEntry() }) { Text("Convert") } },
            dismissButton = { TextButton(onClick = { showConvertConfirm = false }) { Text("Cancel") } },
        )
    }
}
