package com.trails.app.ui.sections

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.ui.timeline.graph.sectionSolidColor

/** Mirrors app/(web)/trips/[tripId]/sections/page.tsx (read-only list; add/edit requires connectivity, not built yet). */
@Composable
fun SectionsScreen(padding: PaddingValues, viewModel: SectionsViewModel = hiltViewModel()) {
    val sections by viewModel.sections.collectAsState(initial = emptyList())

    Box(modifier = Modifier.padding(padding).fillMaxSize()) {
        if (sections.isEmpty()) {
            Text(
                "No Sections yet.",
                modifier = Modifier.align(Alignment.Center).padding(24.dp),
                color = TrailsColors.TextSoft,
            )
        } else {
            LazyColumn(contentPadding = PaddingValues(16.dp)) {
                items(sections, key = { it.id }) { section ->
                    val index = sections.indexOf(section)
                    Row(modifier = Modifier.padding(vertical = 10.dp)) {
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
                        modifier = Modifier.padding(start = 24.dp),
                    )
                }
            }
        }
    }
}
