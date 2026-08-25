package com.trails.app.update

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import com.trails.app.R

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
        title = { Text(stringResource(R.string.shell_update_title, info.versionName)) },
        text = {
            if (state.downloading) {
                CircularProgressIndicator()
            } else if (state.error) {
                Text(stringResource(R.string.shell_update_error))
            } else {
                Text(info.releaseNotes.ifBlank { stringResource(R.string.shell_update_body_generic) })
            }
        },
        confirmButton = {
            TextButton(onClick = viewModel::startUpdate, enabled = !state.downloading) {
                Text(stringResource(if (state.downloading) R.string.shell_update_downloading else R.string.shell_update_now))
            }
        },
        dismissButton = {
            TextButton(onClick = viewModel::dismiss, enabled = !state.downloading) {
                Text(stringResource(R.string.shell_update_later))
            }
        },
    )
}
