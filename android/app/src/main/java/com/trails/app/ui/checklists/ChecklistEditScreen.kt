package com.trails.app.ui.checklists

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
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
import com.trails.app.ui.components.CheckboxRow
import com.trails.app.ui.components.ErrorBanner
import com.trails.app.ui.components.LabeledField
import com.trails.app.ui.components.MultilineLabeledField
import com.trails.app.ui.components.PillButton
import com.trails.app.ui.components.PillButtonVariant
import com.trails.app.ui.components.ScreenHeading
import com.trails.app.ui.components.TrailsCard
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

    val scrollState = rememberScrollState()
    LaunchedEffect(state.error) { if (state.error != null) scrollState.animateScrollTo(0) }

    val itemsForThisChecklist = checklists.find { it.checklist.id == state.checklistId }?.items.orEmpty()
    val isNew = state.checklistId == null

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
                emoji = "✅",
                title = if (isNew) "New checklist" else "Edit checklist",
                subtitle = "Packing lists, pre-departure tasks, anything worth tracking.",
            )
            LabeledField(label = "Title", value = state.title, onValueChange = viewModel::onTitleChange)
            MultilineLabeledField(label = "Description (optional)", value = state.description, onValueChange = viewModel::onDescriptionChange)
            // User-requested: "Checklists can be marked as private or shared
            // with other trip users." See Checklist.isPrivate's schema comment
            // for why this has no read-time enforcement effect yet.
            CheckboxRow(label = "Private -- only you can see this", checked = state.isPrivate, onCheckedChange = viewModel::onIsPrivateChange)

            if (state.saving) {
                CircularProgressIndicator(modifier = Modifier.padding(top = 4.dp))
            } else {
                PillButton(
                    text = if (isNew) "Create checklist" else "Save changes",
                    onClick = viewModel::save,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }

        if (!isNew) {
            TrailsCard {
                ScreenHeading(emoji = "🧳", title = "Items", subtitle = "${itemsForThisChecklist.count { it.checked }}/${itemsForThisChecklist.size} packed")

                if (itemsForThisChecklist.isEmpty()) {
                    Text(
                        "Nothing on this list yet -- add the first thing below.",
                        style = androidx.compose.material3.MaterialTheme.typography.bodyMedium,
                        color = TrailsColors.TextSoft,
                    )
                } else {
                    Column {
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
                                    Icon(Icons.Filled.Close, contentDescription = "Remove item", tint = TrailsColors.TextSoft)
                                }
                            }
                        }
                    }
                }

                Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = state.newItemText,
                        onValueChange = viewModel::onNewItemTextChange,
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                        placeholder = { Text("Add an item…") },
                        shape = TrailsShapes.Input,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = TrailsColors.BrandAccent,
                            unfocusedBorderColor = TrailsColors.InputBorder,
                            focusedContainerColor = TrailsColors.Surface,
                            unfocusedContainerColor = TrailsColors.Surface,
                        ),
                    )
                    IconButton(
                        onClick = viewModel::addItem,
                        modifier = Modifier.padding(start = 8.dp).size(44.dp),
                        colors = IconButtonDefaults.filledIconButtonColors(containerColor = TrailsColors.BrandAccent, contentColor = TrailsColors.TextOnDark),
                    ) {
                        Icon(Icons.Filled.Add, contentDescription = "Add item")
                    }
                }
            }

            HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
            PillButton(
                text = "Delete checklist",
                variant = PillButtonVariant.Danger,
                onClick = { showDeleteConfirm = true },
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }

    if (showDeleteConfirm) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirm = false },
            title = { Text("Delete this checklist?") },
            text = { Text("This cannot be undone.") },
            confirmButton = { TextButton(onClick = { showDeleteConfirm = false; viewModel.deleteChecklist() }) { Text("Delete") } },
            dismissButton = { TextButton(onClick = { showDeleteConfirm = false }) { Text("Cancel") } },
        )
    }
}
