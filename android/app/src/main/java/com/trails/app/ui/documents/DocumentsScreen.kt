package com.trails.app.ui.documents

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.ui.theme.TrailsShapes
import com.trails.app.util.openCachedFile

/** Mirrors app/(web)/trips/[tripId]/documents/page.tsx -- tapping a row opens the on-device cached copy (offline works), downloading it first if the sync pass hasn't yet. */
@Composable
fun DocumentsScreen(padding: PaddingValues, viewModel: DocumentsViewModel = hiltViewModel()) {
    val groups by viewModel.groups.collectAsState()
    val downloadingIds by viewModel.downloadingIds.collectAsState()
    val context = LocalContext.current

    Box(modifier = Modifier.padding(padding).fillMaxSize()) {
        if (groups.isEmpty()) {
            Text(
                "No documents uploaded on this Trip yet.",
                modifier = Modifier.align(Alignment.Center).padding(24.dp),
                color = TrailsColors.TextSoft,
            )
        } else {
            LazyColumn(contentPadding = PaddingValues(16.dp)) {
                groups.forEach { group ->
                    item {
                        Card(
                            modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
                            shape = TrailsShapes.Card,
                            colors = CardDefaults.cardColors(containerColor = TrailsColors.Surface),
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Text(group.label, style = MaterialTheme.typography.titleMedium, color = TrailsColors.Text)
                                group.rows.forEach { row ->
                                    val isDownloading = row.attachment.id in downloadingIds
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(top = 10.dp)
                                            .clickable(enabled = !isDownloading) {
                                                viewModel.ensureCached(row.attachment) { path ->
                                                    openCachedFile(context, path, row.attachment.mimeType)
                                                }
                                            },
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(row.attachment.originalFilename, style = MaterialTheme.typography.bodyLarge, color = TrailsColors.BrandAccent)
                                            Text(row.ownerTitle, style = MaterialTheme.typography.bodySmall, color = TrailsColors.TextSoft)
                                        }
                                        if (isDownloading) {
                                            CircularProgressIndicator(modifier = Modifier.size(18.dp), color = TrailsColors.BrandAccent, strokeWidth = 2.dp)
                                        } else {
                                            Text(formatSize(row.attachment.sizeBytes), style = MaterialTheme.typography.bodySmall, color = TrailsColors.TextSoft)
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
}

private fun formatSize(bytes: Int): String = when {
    bytes < 1024 -> "$bytes B"
    bytes < 1024 * 1024 -> "${bytes / 1024} KB"
    else -> "%.1f MB".format(bytes / (1024f * 1024f))
}
