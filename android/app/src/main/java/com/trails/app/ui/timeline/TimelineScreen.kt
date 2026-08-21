package com.trails.app.ui.timeline

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.trails.app.data.entity.TimelineEntryEntity
import com.trails.app.ui.components.TrailsTopBar
import com.trails.app.ui.theme.TrailsColors

// Phase 1/2 scope: entries grouped by day with the same date-header/dot/
// entry-chip look as app/(web)'s timeline (globals.css's .timeline-date-*/
// .entry-chip), reading straight from the local cache -- fully usable
// offline once synced once. The GitKraken-style branch/merge graph itself
// (lib/timeline.ts's buildTimelineDays/layoutTimelineEntries, including
// empty gap days and Section color bands) is Phase 3.
@Composable
fun TimelineScreen(viewModel: TimelineViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsState()
    val entriesByDay = remember(state.entries) {
        state.entries.groupBy { it.startAt.take(10) }.toSortedMap()
    }

    Scaffold(
        containerColor = TrailsColors.Canvas,
        topBar = { TrailsTopBar(title = "Timeline") },
    ) { padding ->
        Box(modifier = Modifier.padding(padding).fillMaxSize()) {
            if (state.entries.isEmpty() && state.isSyncing) {
                CircularProgressIndicator(
                    modifier = Modifier.align(Alignment.Center),
                    color = TrailsColors.BrandAccent,
                )
            } else if (state.entries.isEmpty()) {
                Text(
                    "No timeline entries yet",
                    modifier = Modifier.align(Alignment.Center),
                    color = TrailsColors.TextSoft,
                )
            } else {
                LazyColumn(contentPadding = PaddingValues(vertical = 8.dp, horizontal = 16.dp)) {
                    entriesByDay.forEach { (dayKey, dayEntries) ->
                        item(key = dayKey) {
                            DayRow(dayKey, dayEntries)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DayRow(dayKey: String, entries: List<TimelineEntryEntity>) {
    Row(modifier = Modifier.padding(vertical = 12.dp)) {
        Column(modifier = Modifier.padding(end = 16.dp).widthIn(min = 56.dp)) {
            Text(
                monthDayLabel(dayKey),
                style = MaterialTheme.typography.titleMedium,
                color = TrailsColors.Text,
            )
            Text(
                weekdayLabel(dayKey),
                style = MaterialTheme.typography.bodySmall,
                color = TrailsColors.TextSoft,
            )
        }
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            entries.forEach { entry -> EntryChip(entry) }
        }
    }
}

@Composable
private fun EntryChip(entry: TimelineEntryEntity) {
    val dotColor = entryTypeColor(entry.entryType)
    val isBlog = entry.entryType == "BLOG_POST"
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .size(10.dp)
                .background(dotColor, CircleShape),
        )
        Text(
            text = if (isBlog) "📖 ${entry.title}" else entry.title,
            style = MaterialTheme.typography.bodyMedium,
            color = if (isBlog) TrailsColors.BrandDeep else TrailsColors.Text,
            modifier = Modifier.padding(start = 10.dp),
        )
    }
}

// Mirrors lib/entry-types/colors.ts::entryTypeColor.
private fun entryTypeColor(entryType: String): Color = when (entryType) {
    "STAY" -> TrailsColors.BrandAccent
    "TRANSPORT" -> TrailsColors.BrandUplift
    "ACTIVITY" -> TrailsColors.Brand
    "BLOG_POST" -> TrailsColors.BrandDeep
    else -> TrailsColors.TextSoft // NOTE
}

private fun weekdayLabel(dayKey: String): String = runCatching {
    java.time.LocalDate.parse(dayKey.substring(0, 10))
        .dayOfWeek
        .getDisplayName(java.time.format.TextStyle.SHORT, java.util.Locale.getDefault())
}.getOrDefault("")

private fun monthDayLabel(dayKey: String): String = runCatching {
    val date = java.time.LocalDate.parse(dayKey.substring(0, 10))
    val month = date.month.getDisplayName(java.time.format.TextStyle.SHORT, java.util.Locale.getDefault())
    "$month ${date.dayOfMonth}"
}.getOrDefault(dayKey)
