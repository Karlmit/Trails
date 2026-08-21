package com.trails.app.update

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.hilt.navigation.compose.hiltViewModel

/**
 * Mounted once at the app root (MainActivity), alongside the nav host, not
 * inside it -- an update prompt should be able to appear over any screen.
 * Renders nothing until a check (run once per launch, see UpdateViewModel's
 * init) finds a newer GitHub release than what's installed.
 */
@Composable
fun UpdatePrompt(viewModel: UpdateViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsState()
    val info = state.available ?: return

    AlertDialog(
        onDismissRequest = { if (!state.downloading) viewModel.dismiss() },
        title = { Text("Update available: ${info.versionName}") },
        text = {
            if (state.downloading) {
                CircularProgressIndicator()
            } else {
                Text(state.error ?: info.releaseNotes.ifBlank { "A new version of Trails is available." })
            }
        },
        confirmButton = {
            TextButton(onClick = viewModel::startUpdate, enabled = !state.downloading) {
                Text(if (state.downloading) "Downloading…" else "Update now")
            }
        },
        dismissButton = {
            TextButton(onClick = viewModel::dismiss, enabled = !state.downloading) {
                Text("Later")
            }
        },
    )
}
