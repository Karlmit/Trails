package com.trails.app.ui.timeline

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ListItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import com.trails.app.data.entity.TimelineEntryEntity

// Phase 1 scope: entries as a plain chronological list, reading straight from
// the local cache -- fully usable offline once synced once. The GitKraken-
// style branch/merge visual (lib/timeline.ts's buildTimelineDays /
// layoutTimelineEntries, ported to Kotlin) is Phase 3.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TimelineScreen(viewModel: TimelineViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = { TopAppBar(title = { Text("Timeline") }) },
    ) { padding ->
        Box(modifier = Modifier.padding(padding).fillMaxSize()) {
            if (state.entries.isEmpty() && state.isSyncing) {
                CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
            } else if (state.entries.isEmpty()) {
                Text("No timeline entries yet", modifier = Modifier.align(Alignment.Center))
            } else {
                LazyColumn {
                    items(state.entries, key = { it.id }) { entry: TimelineEntryEntity ->
                        ListItem(
                            headlineContent = { Text(entry.title) },
                            supportingContent = { Text("${entry.entryType} · ${entry.startAt}") },
                        )
                    }
                }
            }
        }
    }
}
