package com.trails.app.ui.ideas

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
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
import com.trails.app.ui.components.ChipInputField
import com.trails.app.ui.components.DropdownField
import com.trails.app.ui.components.ErrorBanner
import com.trails.app.ui.components.LabeledField
import com.trails.app.ui.components.LinksEditor
import com.trails.app.ui.components.PillButton
import com.trails.app.ui.components.PillButtonVariant

@Composable
fun IdeaEditScreen(
    padding: PaddingValues,
    onDone: () -> Unit,
    viewModel: IdeaEditViewModel = hiltViewModel(),
    ideasViewModel: IdeasViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    val ideas by ideasViewModel.ideas.collectAsState(initial = emptyList())
    var showDeleteConfirm by remember { mutableStateOf(false) }
    var showConvertConfirm by remember { mutableStateOf(false) }

    LaunchedEffect(ideas) { viewModel.loadIfEditing(ideas) }
    LaunchedEffect(state.saved, state.deleted, state.converted) {
        if (state.saved || state.deleted || state.converted) onDone()
    }

    Column(
        modifier = Modifier
            .padding(padding)
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        state.error?.let { ErrorBanner(it) }

        LabeledField(label = "Title", value = state.title, onValueChange = viewModel::onTitleChange)
        LabeledField(label = "Category (optional)", value = state.category, onValueChange = viewModel::onCategoryChange)
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
        ChipInputField(
            label = "Weather tags",
            tags = state.weatherTags,
            onRemove = viewModel::removeWeatherTag,
            onAdd = viewModel::addWeatherTag,
        )
        LabeledField(label = "Location name", value = state.locationName, onValueChange = viewModel::onLocationNameChange)
        LabeledField(label = "Location address", value = state.locationAddress, onValueChange = viewModel::onLocationAddressChange)
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
        LinksEditor(links = state.links, onAdd = viewModel::addLink, onRemove = viewModel::removeLink)

        if (state.saving) {
            CircularProgressIndicator()
        } else {
            PillButton(text = if (state.ideaId == null) "Create Idea" else "Save changes", onClick = viewModel::save)
            if (state.ideaId != null) {
                PillButton(text = "Convert to Timeline Entry", variant = PillButtonVariant.Outline, onClick = { showConvertConfirm = true })
                PillButton(text = "Delete Idea", variant = PillButtonVariant.Danger, onClick = { showDeleteConfirm = true })
            }
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
