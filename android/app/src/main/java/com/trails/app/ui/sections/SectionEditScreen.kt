package com.trails.app.ui.sections

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.trails.app.ui.components.DatePickerField
import com.trails.app.ui.components.ErrorBanner
import com.trails.app.ui.components.LabeledField
import com.trails.app.ui.components.PillButton
import com.trails.app.ui.components.PillButtonVariant
import com.trails.app.ui.components.ScreenHeading
import com.trails.app.ui.components.TrailsCard
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.ui.timeline.graph.SECTION_COLOR_OPTIONS
import com.trails.app.ui.timeline.graph.SECTION_EMOJI_OPTIONS
import com.trails.app.ui.timeline.graph.sectionSwatchColor

@Composable
fun SectionEditScreen(
    padding: PaddingValues,
    onDone: () -> Unit,
    viewModel: SectionEditViewModel = hiltViewModel(),
    sectionsViewModel: SectionsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    val sections by sectionsViewModel.sections.collectAsState(initial = emptyList())
    var showDeleteConfirm by remember { mutableStateOf(false) }

    LaunchedEffect(sections) { viewModel.loadIfEditing(sections) }
    LaunchedEffect(state.saved, state.deleted) { if (state.saved || state.deleted) onDone() }

    val scrollState = rememberScrollState()
    LaunchedEffect(state.error) { if (state.error != null) scrollState.animateScrollTo(0) }

    val isNew = state.sectionId == null

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
                emoji = state.emoji?.takeIf { it.isNotBlank() } ?: "🗂️",
                title = if (isNew) "New section" else "Edit section",
                subtitle = "A leg of the trip -- give it a name, dates, and a look of its own.",
            )

            LabeledField(label = "Name", value = state.name, onValueChange = viewModel::onNameChange)
            DatePickerField(label = "Start date", isoDate = state.startDate, onDateChange = viewModel::onStartDateChange)
            DatePickerField(label = "End date", isoDate = state.endDate, onDateChange = viewModel::onEndDateChange)

            ColorSwatchPicker(selected = state.color, onToggle = viewModel::onColorToggle)
            EmojiPicker(selected = state.emoji, onToggle = viewModel::onEmojiToggle)

            if (state.saving) {
                CircularProgressIndicator(modifier = Modifier.padding(top = 4.dp))
            } else {
                PillButton(
                    text = if (isNew) "Create section" else "Save changes",
                    onClick = viewModel::save,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }

        if (!isNew && !state.saving) {
            PillButton(
                text = "Delete section",
                variant = PillButtonVariant.Danger,
                onClick = { showDeleteConfirm = true },
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }

    if (showDeleteConfirm) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirm = false },
            title = { Text("Delete this Section?") },
            text = { Text("This cannot be undone.") },
            confirmButton = {
                TextButton(onClick = { showDeleteConfirm = false; viewModel.delete() }) { Text("Delete") }
            },
            dismissButton = { TextButton(onClick = { showDeleteConfirm = false }) { Text("Cancel") } },
        )
    }
}

/** Curated color swatches only -- lib/validation.ts's sectionColorField rejects anything outside this exact set. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ColorSwatchPicker(selected: String?, onToggle: (String) -> Unit) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(text = "COLOR", style = MaterialTheme.typography.labelMedium, color = TrailsColors.TextSoft)
        FlowRow(modifier = Modifier.fillMaxWidth().padding(top = 6.dp)) {
            SECTION_COLOR_OPTIONS.forEach { value ->
                val isSelected = value == selected
                Box(
                    modifier = Modifier
                        .padding(end = 10.dp, bottom = 10.dp)
                        .size(36.dp)
                        .background(sectionSwatchColor(value), CircleShape)
                        .border(if (isSelected) 3.dp else 0.dp, TrailsColors.Text, CircleShape)
                        .clickable { onToggle(value) },
                )
            }
        }
    }
}

/** Curated emoji grid only -- lib/validation.ts's sectionEmojiField rejects anything outside this exact set. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun EmojiPicker(selected: String?, onToggle: (String) -> Unit) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(text = "EMOJI", style = MaterialTheme.typography.labelMedium, color = TrailsColors.TextSoft)
        FlowRow(modifier = Modifier.fillMaxWidth().padding(top = 6.dp)) {
            SECTION_EMOJI_OPTIONS.forEach { value ->
                val isSelected = value == selected
                Box(
                    modifier = Modifier
                        .padding(end = 6.dp, bottom = 6.dp)
                        .size(40.dp)
                        .background(if (isSelected) TrailsColors.BrandMint else Color.Transparent, CircleShape)
                        .border(if (isSelected) 2.dp else 0.dp, TrailsColors.BrandAccent, CircleShape)
                        .clickable { onToggle(value) },
                    contentAlignment = Alignment.Center,
                ) {
                    Text(value, style = MaterialTheme.typography.titleMedium)
                }
            }
        }
    }
}
