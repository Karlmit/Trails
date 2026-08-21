package com.trails.app.ui.blog

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
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
import com.trails.app.ui.components.DatePickerField
import com.trails.app.ui.components.ErrorBanner
import com.trails.app.ui.components.LabeledField
import com.trails.app.ui.components.MultilineLabeledField
import com.trails.app.ui.components.PillButton
import com.trails.app.ui.components.PillButtonVariant
import com.trails.app.ui.theme.TrailsColors

@Composable
fun BlogEditScreen(
    padding: PaddingValues,
    onDone: () -> Unit,
    viewModel: BlogEditViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    var showDeleteConfirm by remember { mutableStateOf(false) }

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

        if (state.hasRichContent) {
            Text(
                "This post has formatting or images from the web editor -- editing here would replace it with plain text, so the body is left blank. Title, date, and privacy can still be changed safely.",
                color = TrailsColors.TextSoft,
                style = androidx.compose.material3.MaterialTheme.typography.bodySmall,
            )
        }

        LabeledField(label = "Title", value = state.title, onValueChange = viewModel::onTitleChange)
        DatePickerField(label = "Date", isoDate = state.startAt.take(10), onDateChange = { viewModel.onStartAtChange("${it}T00:00:00.000Z") })
        CheckboxRow(label = "Private (only visible to you)", checked = state.isPrivate, onCheckedChange = viewModel::onIsPrivateChange)
        MultilineLabeledField(label = "Body (separate paragraphs with a blank line)", value = state.body, onValueChange = viewModel::onBodyChange, minLines = 8)

        if (state.saving) {
            CircularProgressIndicator()
        } else {
            PillButton(text = if (state.entryId == null) "Save Draft" else "Save changes", onClick = viewModel::save)
            if (state.entryId != null) {
                PillButton(text = "Publish", variant = PillButtonVariant.Outline, onClick = viewModel::publish)
                HorizontalDivider()
                PillButton(text = "Delete Post", variant = PillButtonVariant.Danger, onClick = { showDeleteConfirm = true })
            }
        }
    }

    if (showDeleteConfirm) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirm = false },
            title = { Text("Delete this Blog Post?") },
            text = { Text("This cannot be undone.") },
            confirmButton = { TextButton(onClick = { showDeleteConfirm = false; viewModel.delete() }) { Text("Delete") } },
            dismissButton = { TextButton(onClick = { showDeleteConfirm = false }) { Text("Cancel") } },
        )
    }
}
