package com.trails.app.ui.documents

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.trails.app.R
import com.trails.app.ui.components.EmptyState
import com.trails.app.ui.components.PullToRefreshScreen
import com.trails.app.ui.components.ScreenHeading
import com.trails.app.ui.components.TrailsCard
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.util.openCachedFile

/** Mirrors app/(web)/trips/[tripId]/documents/page.tsx -- tapping a row opens the on-device cached copy (offline works), downloading it first if the sync pass hasn't yet. */
@Composable
fun DocumentsScreen(padding: PaddingValues, viewModel: DocumentsViewModel = hiltViewModel()) {
    val groups by viewModel.groups.collectAsState()
    val downloadingIds by viewModel.downloadingIds.collectAsState()
    val isRefreshing by viewModel.isRefreshing.collectAsState()
    val context = LocalContext.current

    PullToRefreshScreen(isRefreshing = isRefreshing, onRefresh = viewModel::refresh, modifier = Modifier.padding(padding).fillMaxSize()) {
        if (groups.isEmpty()) {
            EmptyState(
                emoji = "📎",
                message = stringResource(R.string.document_empty_state),
                modifier = Modifier.align(Alignment.Center),
            )
        } else {
            LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp)) {
                groups.forEach { group ->
                    item {
                        TrailsCard(modifier = Modifier.padding(bottom = 12.dp)) {
                            ScreenHeading(emoji = group.emoji, title = group.label)
                            group.rows.forEachIndexed { index, attachment ->
                                if (index > 0) {
                                    HorizontalDivider(color = TrailsColors.HairlineOnLight)
                                }
                                val isDownloading = attachment.id in downloadingIds
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(vertical = 10.dp)
                                        .clickable(enabled = !isDownloading) {
                                            viewModel.ensureCached(attachment) { path ->
                                                openCachedFile(context, path, attachment.mimeType)
                                            }
                                        },
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Text(
                                        attachment.originalFilename,
                                        style = MaterialTheme.typography.bodyLarge,
                                        color = TrailsColors.BrandAccent,
                                        modifier = Modifier.weight(1f),
                                    )
                                    if (isDownloading) {
                                        CircularProgressIndicator(modifier = Modifier.size(18.dp), color = TrailsColors.BrandAccent, strokeWidth = 2.dp)
                                    } else {
                                        Text(formatSize(attachment.sizeBytes), style = MaterialTheme.typography.bodySmall, color = TrailsColors.TextSoft)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
@ReadOnlyComposable
private fun formatSize(bytes: Int): String = when {
    bytes < 1024 -> stringResource(R.string.document_size_bytes, bytes)
    bytes < 1024 * 1024 -> stringResource(R.string.document_size_kb, bytes / 1024)
    else -> stringResource(R.string.document_size_mb, bytes / (1024f * 1024f))
}
