package com.trails.app.ui.sections

import androidx.compose.foundation.background
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
import androidx.compose.foundation.shape.CircleShape
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
import com.trails.app.data.entity.SectionEntity
import com.trails.app.ui.components.EmptyState
import com.trails.app.ui.components.PullToRefreshScreen
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.ui.theme.TrailsShapes
import com.trails.app.ui.timeline.graph.sectionSolidColor

/** Mirrors app/(web)/trips/[tripId]/sections/page.tsx, plus create/edit via [onOpenSection]'s FAB/tap wiring in the nav host. */
@Composable
fun SectionsScreen(padding: PaddingValues, onOpenSection: (String?) -> Unit = {}, viewModel: SectionsViewModel = hiltViewModel()) {
    val sections by viewModel.sections.collectAsState(initial = emptyList())
    val isRefreshing by viewModel.isRefreshing.collectAsState()

    PullToRefreshScreen(isRefreshing = isRefreshing, onRefresh = viewModel::refresh, modifier = Modifier.padding(padding).fillMaxSize()) {
        if (sections.isEmpty()) {
            EmptyState(
                emoji = "🗂️",
                message = "No sections yet.\nSplit the trip into legs -- a city, a leg, a house.",
                modifier = Modifier.align(Alignment.Center),
            )
        } else {
            LazyColumn(contentPadding = PaddingValues(16.dp)) {
                items(sections, key = { it.id }) { section ->
                    val index = sections.indexOf(section)
                    SectionRow(section, index, onClick = { onOpenSection(section.id) })
                }
            }
        }
    }
}

@Composable
private fun SectionRow(section: SectionEntity, index: Int, onClick: () -> Unit) {
    ElevatedCard(
        modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp).clickable(onClick = onClick),
        shape = TrailsShapes.Card,
        colors = CardDefaults.elevatedCardColors(containerColor = TrailsColors.Surface),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 1.dp),
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(14.dp)
                        .background(sectionSolidColor(index, section.color), CircleShape),
                )
                Text(
                    text = buildString {
                        if (section.emoji != null) append("${section.emoji} ")
                        append(section.name)
                    },
                    style = MaterialTheme.typography.titleMedium,
                    color = TrailsColors.Text,
                    modifier = Modifier.padding(start = 10.dp),
                )
            }
            Text(
                "${section.startDate} → ${section.endDate}",
                style = MaterialTheme.typography.bodySmall,
                color = TrailsColors.TextSoft,
                modifier = Modifier.padding(start = 24.dp, top = 2.dp),
            )
        }
    }
}
