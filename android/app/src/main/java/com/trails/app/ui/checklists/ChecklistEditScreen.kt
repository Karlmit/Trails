package com.trails.app.ui.checklists

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import com.trails.app.ui.components.CheckboxRow
import com.trails.app.ui.components.ErrorBanner
import com.trails.app.ui.components.LabeledField
import com.trails.app.ui.components.PillButton
import com.trails.app.ui.components.PillButtonVariant
import com.trails.app.ui.components.ScreenHeading
import com.trails.app.ui.components.TrailsCard

/**
 * User-requested: this screen is now just Title/Emoji/Private + Delete --
 * Items moved to ChecklistDetailScreen, and Save moved to the top app
 * bar's action slot (see TrailsNavHost, which shares this same
 * hiltViewModel() instance to wire that button). Delete stays here and
 * only here ("Delete checklist only available when in edit mode"), behind
 * its own confirmation dialog.
 */
@Composable
fun ChecklistEditScreen(
    padding: PaddingValues,
    onDeleted: () -> Unit,
    viewModel: ChecklistEditViewModel = hiltViewModel(),
    checklistsViewModel: ChecklistsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    val checklists by checklistsViewModel.checklists.collectAsState(initial = emptyList())
    var showDeleteConfirm by remember { mutableStateOf(false) }

    LaunchedEffect(checklists) { viewModel.loadIfEditing(checklists) }
    LaunchedEffect(state.deleted) { if (state.deleted) onDeleted() }

    val scrollState = rememberScrollState()
    LaunchedEffect(state.error) { if (state.error != null) scrollState.animateScrollTo(0) }

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
                emoji = state.emoji.takeIf { it.isNotBlank() } ?: "✅",
                title = if (isNew) "New checklist" else "Edit checklist",
                subtitle = "Packing lists, pre-departure tasks, anything worth tracking.",
            )

            LabeledField(label = "Title", value = state.title, onValueChange = viewModel::onTitleChange)
            LabeledField(label = "Emoji (optional)", value = state.emoji, onValueChange = viewModel::onEmojiChange)
            // User-requested: "Checklists can be marked as private or shared
            // with other trip users." See Checklist.isPrivate's schema comment
            // for the enforcement details.
            CheckboxRow(label = "Private -- only you can see this", checked = state.isPrivate, onCheckedChange = viewModel::onIsPrivateChange)

            if (state.saving) {
                CircularProgressIndicator(modifier = Modifier.padding(top = 4.dp))
            }
        }

        if (!isNew && !state.saving) {
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
