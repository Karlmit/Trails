package com.trails.app.ui.blog

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.text
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.trails.app.R
import com.trails.app.ui.theme.TrailsColors

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
internal fun BlogProofreadingSheet(
    state: ProofreadingState,
    canApply: Boolean,
    onDismiss: () -> Unit,
    onRetry: () -> Unit,
    onDownload: () -> Unit,
    onInsert: () -> Unit,
    onReplace: () -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        shape = MaterialTheme.shapes.extraLarge,
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(start = 24.dp, end = 24.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    stringResource(R.string.blog_proofread_title),
                    style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.weight(1f).semantics { heading() },
                )
                IconButton(onClick = onDismiss) {
                    Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.blog_proofread_close))
                }
            }

            Column(
                modifier = Modifier.weight(1f, fill = false).heightIn(max = 360.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                when (state) {
                    is ProofreadingSuggestion -> SuggestionText(state)
                    is ProofreadingStatus -> {
                        Text(
                            stringResource(state.messageRes),
                            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                        )
                        if (state == ProofreadingStatus.Checking || state == ProofreadingStatus.Generating ||
                            state == ProofreadingStatus.Downloading
                        ) {
                            LinearProgressIndicator(Modifier.fillMaxWidth())
                        }
                    }
                }
            }

            when (state) {
                is ProofreadingSuggestion -> FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedButton(onClick = onInsert, enabled = canApply) {
                        Text(stringResource(R.string.blog_proofread_insert))
                    }
                    Button(onClick = onReplace, enabled = canApply) {
                        Text(stringResource(R.string.blog_proofread_replace))
                    }
                }
                ProofreadingStatus.Downloadable -> Button(onClick = onDownload) {
                    Text(stringResource(R.string.blog_proofread_download))
                }
                ProofreadingStatus.DownloadInProgress, ProofreadingStatus.Unavailable -> OutlinedButton(onClick = onRetry) {
                    Text(stringResource(R.string.blog_proofread_recheck))
                }
                ProofreadingStatus.DownloadFailed, ProofreadingStatus.Failed,
                ProofreadingStatus.InvalidSuggestion -> OutlinedButton(onClick = onRetry) {
                    Text(stringResource(R.string.blog_proofread_retry))
                }
                else -> Unit
            }
        }
    }
}

@Composable
private fun SuggestionText(suggestion: ProofreadingSuggestion) {
    val corrected = remember(suggestion) { suggestion.correctedRuns.toAnnotatedString() }
    val additions = SpanStyle(background = TrailsColors.BlogSurface, color = TrailsColors.BlogInk)
    val deletions = SpanStyle(color = TrailsColors.Danger, textDecoration = TextDecoration.LineThrough)
    val preview = remember(suggestion, additions, deletions) {
        buildAnnotatedString {
            var cursor = 0
            for (change in suggestion.changes) {
                append(corrected, cursor, change.start)
                if (change.removed.isNotEmpty()) {
                    withStyle(deletions) { append(change.removed) }
                }
                if (change.start < change.end) {
                    withStyle(additions) { append(corrected, change.start, change.end) }
                }
                cursor = change.end
            }
            append(corrected, cursor, corrected.length)
        }
    }
    val removedText = suggestion.changes.mapNotNull { it.removed.takeIf(String::isNotEmpty) }
    val removalDescription = if (removedText.isEmpty()) null else {
        Text(stringResource(R.string.blog_proofread_deletions), style = MaterialTheme.typography.bodySmall)
        stringResource(R.string.blog_proofread_removed_text, removedText.joinToString(", "))
    }
    Text(
        text = preview,
        style = MaterialTheme.typography.bodyLarge,
        modifier = Modifier.fillMaxWidth()
            .background(MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.shapes.medium)
            .padding(16.dp)
            .clearAndSetSemantics {
                text = corrected
                if (removalDescription != null) stateDescription = removalDescription
            },
    )
}

private val ProofreadingStatus.messageRes: Int
    get() = when (this) {
        ProofreadingStatus.Checking -> R.string.blog_proofread_checking
        ProofreadingStatus.Downloadable -> R.string.blog_proofread_setup
        ProofreadingStatus.Downloading -> R.string.blog_proofread_downloading
        ProofreadingStatus.DownloadInProgress -> R.string.blog_proofread_download_in_progress
        ProofreadingStatus.DownloadFailed -> R.string.blog_proofread_download_failed
        ProofreadingStatus.Unavailable -> R.string.blog_proofread_unavailable
        ProofreadingStatus.Generating -> R.string.blog_proofread_generating
        ProofreadingStatus.TooLong -> R.string.blog_proofread_too_long
        ProofreadingStatus.NoChanges -> R.string.blog_proofread_no_changes
        ProofreadingStatus.InvalidSuggestion -> R.string.blog_proofread_invalid
        ProofreadingStatus.Failed -> R.string.blog_proofread_failed
        ProofreadingStatus.Stale -> R.string.blog_proofread_stale
    }
