package com.trails.app.ui.timeline

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.ui.theme.TrailsShapes
import com.trails.app.ui.timeline.graph.TimelineDayWithEntries
import com.trails.app.ui.timeline.graph.TimelineGraphColumn
import com.trails.app.ui.timeline.graph.dayLineLabel
import com.trails.app.ui.timeline.graph.formatDayLabel
import com.trails.app.ui.timeline.graph.graphWidthFor
import com.trails.app.ui.timeline.graph.sectionBandColor
import com.trails.app.ui.timeline.graph.sectionSolidColor
import com.trails.app.ui.timeline.graph.subtypeLabel

/**
 * The GitKraken-style branch/merge graph -- ported 1:1 from
 * app/(web)/trips/[tripId]/timeline/page.tsx (see ui/timeline/graph/).
 */
@Composable
fun TimelineScreen(
    padding: PaddingValues,
    onOpenEntry: (entryType: String, entryId: String) -> Unit = { _, _ -> },
    viewModel: TimelineViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val layout = state.layout
    val trip = state.trip

    Box(modifier = Modifier.padding(padding).fillMaxSize()) {
        if (layout == null && state.isSyncing) {
            CircularProgressIndicator(
                modifier = Modifier.align(Alignment.Center),
                color = TrailsColors.BrandAccent,
            )
        } else if (trip == null || layout == null) {
            Text("No trip data yet", modifier = Modifier.align(Alignment.Center), color = TrailsColors.TextSoft)
        } else {
            val graphWidth = graphWidthFor(layout.laneCount)
            Column(modifier = Modifier.fillMaxSize()) {
                if (state.sections.isEmpty()) {
                    Text(
                        "No Sections yet.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = TrailsColors.TextSoft,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                    )
                }
                LazyColumn(modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp)) {
                    itemsIndexed(layout.days, key = { _, day -> day.day.dateKey }) { index, day ->
                        val previousSectionIndex = if (index > 0) layout.days[index - 1].day.sectionIndex else null
                        val section = day.day.sectionIndex?.let { state.sections.getOrNull(it) }
                        val showSectionLabel = section != null && day.day.sectionIndex != previousSectionIndex
                        DayRow(
                            day = day,
                            graphWidth = graphWidth,
                            sectionName = section?.name,
                            sectionEmoji = section?.emoji,
                            trunkColor = section?.let { sectionSolidColor(day.day.sectionIndex!!, it.color) },
                            bandColor = section?.let { sectionBandColor(day.day.sectionIndex!!, it.color) },
                            showSectionLabel = showSectionLabel,
                            tripTimezone = trip.timezone,
                            onOpenEntry = onOpenEntry,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DayRow(
    day: TimelineDayWithEntries,
    graphWidth: androidx.compose.ui.unit.Dp,
    sectionName: String?,
    sectionEmoji: String?,
    trunkColor: androidx.compose.ui.graphics.Color?,
    bandColor: androidx.compose.ui.graphics.Color?,
    showSectionLabel: Boolean,
    tripTimezone: String,
    onOpenEntry: (String, String) -> Unit,
) {
    // Deliberately NO vertical padding/margin on this outer Row -- the trunk
    // line (drawn full-bleed top-to-bottom inside TimelineGraphColumn) and
    // the Section band background must butt up exactly against the next
    // day's row with zero gap, or the trunk reads as broken into segments
    // instead of one continuous line (exactly what any vertical inset here
    // causes). All breathing room lives on the date/content columns only.
    val rowModifier = if (bandColor != null) {
        Modifier.fillMaxWidth().height(IntrinsicSize.Min).background(bandColor)
    } else {
        Modifier.fillMaxWidth().height(IntrinsicSize.Min)
    }
    Row(modifier = rowModifier) {
        TimelineGraphColumn(
            day = day,
            trunkColor = trunkColor,
            canvasBackground = TrailsColors.Canvas,
            modifier = Modifier.width(graphWidth).fillMaxHeight(),
        )
        Column(modifier = Modifier.widthIn(min = 56.dp).padding(horizontal = 8.dp, vertical = 8.dp)) {
            val label = formatDayLabel(day.day.dateKey)
            Text(label.monthDay, style = MaterialTheme.typography.titleMedium, color = TrailsColors.Text)
            Text(label.weekday.take(3), style = MaterialTheme.typography.bodySmall, color = TrailsColors.TextSoft)
        }
        Column(modifier = Modifier.fillMaxWidth().padding(start = 4.dp, top = 8.dp, bottom = 8.dp)) {
            if (showSectionLabel && sectionName != null) {
                Surface(
                    color = TrailsColors.Surface,
                    shape = TrailsShapes.Pill,
                    modifier = Modifier.padding(bottom = 4.dp),
                ) {
                    Text(
                        text = if (sectionEmoji != null) "$sectionEmoji $sectionName" else sectionName,
                        style = MaterialTheme.typography.bodySmall,
                        color = TrailsColors.Text,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 3.dp),
                    )
                }
            }
            if (day.day.isToday) {
                Text(
                    "TODAY",
                    style = MaterialTheme.typography.labelMedium,
                    color = TrailsColors.Gold,
                    modifier = Modifier.padding(bottom = 4.dp),
                )
            }
            if (day.lines.isEmpty()) {
                Text(
                    "No entries yet",
                    style = MaterialTheme.typography.bodyMedium,
                    color = TrailsColors.TextSoft,
                )
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    day.lines.forEach { line ->
                        val label = dayLineLabel(line, tripTimezone)
                        // A Stay's own through-day: the branch line already
                        // shows it's ongoing, so no text at all here (must
                        // match TimelineGraphColumn's own line filtering).
                        if (label.hidden) return@forEach
                        val isBlog = line.entryType == "BLOG_POST"
                        Column(modifier = Modifier.clickable { onOpenEntry(line.entryType, line.entryId) }) {
                            Row(verticalAlignment = Alignment.Top) {
                                if (isBlog) {
                                    Text("📖 ", style = MaterialTheme.typography.bodyMedium)
                                }
                                Text(
                                    buildString {
                                        append(label.title)
                                        if (label.showSubtype && line.subtype != null) append(" · ${subtypeLabel(line.subtype)}")
                                        if (isBlog) append(" Read post →")
                                    },
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = if (isBlog) TrailsColors.BrandDeep else TrailsColors.Text,
                                )
                            }
                            // User-requested: a Stay's check-in/check-out time as its
                            // own line below the name, not folded into the title.
                            if (label.subtitle != null) {
                                Text(
                                    label.subtitle,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = TrailsColors.TextSoft,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
