package com.trails.app.ui.importantinfo

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
import com.trails.app.ui.components.CheckboxRow
import com.trails.app.ui.components.ErrorBanner
import com.trails.app.ui.components.LabeledField
import com.trails.app.ui.components.LinksEditor
import com.trails.app.ui.components.MultilineLabeledField
import com.trails.app.ui.components.PillButton
import com.trails.app.ui.components.PillButtonVariant

@Composable
fun ImportantInfoEditScreen(
    padding: PaddingValues,
    onDone: () -> Unit,
    viewModel: ImportantInfoEditViewModel = hiltViewModel(),
    listViewModel: ImportantInfoViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    val items by listViewModel.items.collectAsState(initial = emptyList())
    var showDeleteConfirm by remember { mutableStateOf(false) }

    LaunchedEffect(items) { viewModel.loadIfEditing(items) }
    LaunchedEffect(state.saved, state.deleted) { if (state.saved || state.deleted) onDone() }

    val scrollState = rememberScrollState()
    LaunchedEffect(state.error) { if (state.error != null) scrollState.animateScrollTo(0) }

    Column(
        modifier = Modifier
            .padding(padding)
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        state.error?.let { ErrorBanner(it) }

        // Deliberately just Title/Description/Private -- user-reported: "too
        // many fields when adding one." Location/contact fields are gone
        // from the UI, but ImportantInfoEditViewModel still loads and
        // resends whatever an existing item already has stored for them
        // (see loadIfEditing/save), so no old data is lost by an edit that
        // never meant to touch them.
        LabeledField(label = "Title *", value = state.title, onValueChange = viewModel::onTitleChange)
        MultilineLabeledField(label = "Description", value = state.content, onValueChange = viewModel::onContentChange)
        CheckboxRow(label = "Private (hidden from Guests)", checked = state.isPrivate, onCheckedChange = viewModel::onIsPrivateChange)
        LinksEditor(links = state.links, onAdd = viewModel::addLink, onRemove = viewModel::removeLink)

        if (state.saving) {
            CircularProgressIndicator()
        } else {
            PillButton(text = if (state.infoId == null) "Create" else "Save changes", onClick = viewModel::save)
            if (state.infoId != null) {
                PillButton(text = "Delete", variant = PillButtonVariant.Danger, onClick = { showDeleteConfirm = true })
            }
        }
    }

    if (showDeleteConfirm) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirm = false },
            title = { Text("Delete this item?") },
            text = { Text("This cannot be undone.") },
            confirmButton = { TextButton(onClick = { showDeleteConfirm = false; viewModel.delete() }) { Text("Delete") } },
            dismissButton = { TextButton(onClick = { showDeleteConfirm = false }) { Text("Cancel") } },
        )
    }
}
