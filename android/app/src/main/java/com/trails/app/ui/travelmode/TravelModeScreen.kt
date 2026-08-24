package com.trails.app.ui.travelmode

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.trails.app.data.entity.TimelineEntryEntity
import com.trails.app.ui.components.EmptyState
import com.trails.app.ui.components.PullToRefreshScreen
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.ui.theme.TrailsShapes
import com.trails.app.ui.timeline.graph.ENTRY_TYPE_LABELS
import com.trails.app.ui.timeline.graph.subtypeLabel

/** Mirrors app/(web)/trips/[tripId]/travel-mode/page.tsx. */
@Composable
fun TravelModeScreen(
    padding: PaddingValues,
    onOpenEntry: (String, String) -> Unit = { _, _ -> },
    viewModel: TravelModeViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val isRefreshing by viewModel.isRefreshing.collectAsState()

    PullToRefreshScreen(isRefreshing = isRefreshing, onRefresh = viewModel::refresh, modifier = Modifier.padding(padding).fillMaxSize()) {
        if (state.tripStatus != "ACTIVE") {
            EmptyState(
                emoji = if (state.tripStatus == "UPCOMING") "⏳" else if (state.tripStatus == "COMPLETED") "🏁" else "🧭",
                message = if (state.tripStatus == "UPCOMING") {
                    "This trip hasn't started yet.\nTravel Mode wakes up once you're on the move."
                } else if (state.tripStatus == "COMPLETED") {
                    "This trip has ended.\nHope it was a good one."
                } else {
                    "Loading…"
                },
                modifier = Modifier.align(Alignment.Center),
            )
        } else {
            LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp)) {
                item {
                    InfoCard("🧭 Right now") {
                        LabeledValue("Section", state.currentSectionName ?: "No Section covers today")
                        LabeledEntry("Stay", state.currentStay, onOpenEntry)
                        LabeledEntry("Activity", state.currentActivity, onOpenEntry)
                    }
                }
                item {
                    InfoCard("⏭️ Up next") {
                        LabeledEntry("Next up", state.nextOverall, onOpenEntry)
                        LabeledEntry("Next Transport", state.nextTransport, onOpenEntry)
                        LabeledEntry("Next Activity", state.nextActivity, onOpenEntry)
                        LabeledEntry("Next Stay", state.nextStay, onOpenEntry)
                    }
                }
                item {
                    InfoCard("📅 Today's full itinerary") {
                        if (state.todaysEntries.isEmpty()) {
                            Text("Nothing on the Timeline for today.", style = MaterialTheme.typography.bodyMedium, color = TrailsColors.TextSoft)
                        } else {
                            state.todaysEntries.forEach { entry ->
                                EntryRow(entry, onOpenEntry, modifier = Modifier.padding(top = 8.dp))
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun InfoCard(title: String, content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit) {
    ElevatedCard(
        modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
        shape = TrailsShapes.Card,
        colors = CardDefaults.elevatedCardColors(containerColor = TrailsColors.Surface),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 1.dp),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, color = TrailsColors.Text)
            Column(modifier = Modifier.padding(top = 8.dp)) { content() }
        }
    }
}

@Composable
private fun LabeledValue(label: String, value: String) {
    Column(modifier = Modifier.padding(bottom = 10.dp)) {
        Text(label.uppercase(), style = MaterialTheme.typography.labelMedium, color = TrailsColors.TextSoft)
        Text(value, style = MaterialTheme.typography.bodyLarge, color = TrailsColors.Text)
    }
}

@Composable
private fun LabeledEntry(label: String, entry: TimelineEntryEntity?, onOpenEntry: (String, String) -> Unit) {
    Column(modifier = Modifier.padding(bottom = 10.dp)) {
        Text(label.uppercase(), style = MaterialTheme.typography.labelMedium, color = TrailsColors.TextSoft)
        if (entry == null) {
            Text("Nothing scheduled", style = MaterialTheme.typography.bodyMedium, color = TrailsColors.TextSoft)
        } else {
            EntryRow(entry, onOpenEntry)
        }
    }
}

@Composable
private fun EntryRow(entry: TimelineEntryEntity, onOpenEntry: (String, String) -> Unit, modifier: Modifier = Modifier) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val mapsUrl = com.trails.app.util.entryMapsUrl(entry.locationAddress, entry.locationName)
    Row(
        modifier = modifier.fillMaxWidth().clickable { onOpenEntry(entry.entryType, entry.id) },
        horizontalArrangement = androidx.compose.foundation.layout.Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(entry.title, style = MaterialTheme.typography.bodyLarge, color = TrailsColors.BrandAccent)
            Text(
                buildString {
                    append(ENTRY_TYPE_LABELS[entry.entryType] ?: entry.entryType)
                    entry.subtype?.let { append(" · ${subtypeLabel(it)}") }
                },
                style = MaterialTheme.typography.bodySmall,
                color = TrailsColors.TextSoft,
            )
        }
        if (mapsUrl != null) {
            Text(
                "Map",
                style = MaterialTheme.typography.labelLarge,
                color = TrailsColors.BrandAccent,
                modifier = Modifier.clickable { com.trails.app.util.openExternalUrl(context, mapsUrl) },
            )
        }
    }
}
