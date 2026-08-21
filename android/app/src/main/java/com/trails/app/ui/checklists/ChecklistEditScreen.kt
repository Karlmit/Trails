package com.trails.app.ui.checklists

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
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
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.trails.app.ui.components.ErrorBanner
import com.trails.app.ui.components.LabeledField
import com.trails.app.ui.components.MultilineLabeledField
import com.trails.app.ui.components.PillButton
import com.trails.app.ui.components.PillButtonVariant
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.ui.theme.TrailsShapes

@Composable
fun ChecklistEditScreen(
    padding: PaddingValues,
    onDone: () -> Unit,
    viewModel: ChecklistEditViewModel = hiltViewModel(),
    checklistsViewModel: ChecklistsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    val checklists by checklistsViewModel.checklists.collectAsState(initial = emptyList())
    var showDeleteConfirm by remember { mutableStateOf(false) }

    LaunchedEffect(checklists) { viewModel.loadIfEditing(checklists) }
    LaunchedEffect(state.deleted) { if (state.deleted) onDone() }

    val itemsForThisChecklist = checklists.find { it.checklist.id == state.checklistId }?.items.orEmpty()

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
        MultilineLabeledField(label = "Description (optional)", value = state.description, onValueChange = viewModel::onDescriptionChange)

        if (state.saving) {
            CircularProgressIndicator()
        } else {
            PillButton(text = if (state.checklistId == null) "Create Checklist" else "Save changes", onClick = viewModel::save)
        }

        if (state.checklistId != null) {
            HorizontalDivider()
            Text("Items", style = androidx.compose.material3.MaterialTheme.typography.titleMedium, color = TrailsColors.Text)
            itemsForThisChecklist.forEach { item ->
                Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(
                        checked = item.checked,
                        onCheckedChange = { checked -> viewModel.setChecked(item.id, checked) },
                        colors = CheckboxDefaults.colors(checkedColor = TrailsColors.BrandAccent),
                    )
                    Text(
                        item.text,
                        modifier = Modifier.weight(1f),
                        color = if (item.checked) TrailsColors.TextSoft else TrailsColors.Text,
                        textDecoration = if (item.checked) TextDecoration.LineThrough else null,
                    )
                    IconButton(onClick = { viewModel.deleteItem(item.id) }) {
                        Icon(Icons.Filled.Close, contentDescription = "Remove item")
                    }
                }
            }
            Row(modifier = Modifier.fillMaxWidth().padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = state.newItemText,
                    onValueChange = viewModel::onNewItemTextChange,
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                    placeholder = { Text("Add item") },
                    shape = TrailsShapes.Input,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = TrailsColors.BrandAccent,
                        unfocusedBorderColor = TrailsColors.InputBorder,
                        focusedContainerColor = TrailsColors.Surface,
                        unfocusedContainerColor = TrailsColors.Surface,
                    ),
                )
                TextButton(onClick = viewModel::addItem) { Text("Add") }
            }

            HorizontalDivider()
            PillButton(text = "Delete Checklist", variant = PillButtonVariant.Danger, onClick = { showDeleteConfirm = true })
        }
    }

    if (showDeleteConfirm) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirm = false },
            title = { Text("Delete this Checklist?") },
            text = { Text("This cannot be undone.") },
            confirmButton = { TextButton(onClick = { showDeleteConfirm = false; viewModel.deleteChecklist() }) { Text("Delete") } },
            dismissButton = { TextButton(onClick = { showDeleteConfirm = false }) { Text("Cancel") } },
        )
    }
}
