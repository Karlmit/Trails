package com.trails.app.ui.sections

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.trails.app.ui.components.DatePickerField
import com.trails.app.ui.components.ErrorBanner
import com.trails.app.ui.components.LabeledField
import com.trails.app.ui.components.PillButton
import com.trails.app.ui.components.PillButtonVariant

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

    Column(
        modifier = Modifier
            .padding(padding)
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        state.error?.let { ErrorBanner(it) }

        LabeledField(label = "Name", value = state.name, onValueChange = viewModel::onNameChange)
        LabeledField(label = "Emoji (optional)", value = state.emoji, onValueChange = viewModel::onEmojiChange)
        DatePickerField(label = "Start date", isoDate = state.startDate, onDateChange = viewModel::onStartDateChange)
        DatePickerField(label = "End date", isoDate = state.endDate, onDateChange = viewModel::onEndDateChange)

        if (state.saving) {
            CircularProgressIndicator()
        } else {
            PillButton(text = if (state.sectionId == null) "Create Section" else "Save changes", onClick = viewModel::save)
            if (state.sectionId != null) {
                PillButton(
                    text = "Delete Section",
                    variant = PillButtonVariant.Danger,
                    onClick = { showDeleteConfirm = true },
                )
            }
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
