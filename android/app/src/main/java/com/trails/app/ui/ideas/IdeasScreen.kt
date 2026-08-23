package com.trails.app.ui.ideas

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import coil3.compose.AsyncImage
import com.trails.app.data.weatherTags
import com.trails.app.ui.components.EmptyState
import com.trails.app.ui.components.PullToRefreshScreen
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.ui.theme.TrailsShapes
import java.io.File

private val PRIORITY_LABELS = mapOf("MUST_DO" to "Must do", "WOULD_LIKE" to "Would like", "MAYBE" to "Maybe")
private val WEATHER_LABELS = mapOf("INDOOR" to "Indoor", "OUTDOOR" to "Outdoor", "EITHER" to "Either")

/** Mirrors app/(web)/trips/[tripId]/ideas/page.tsx's default Section grouping, plus create/edit via [onOpenIdea]. */
@Composable
fun IdeasScreen(padding: PaddingValues, onOpenIdea: (String?) -> Unit = {}, viewModel: IdeasViewModel = hiltViewModel()) {
    val groups by viewModel.groups.collectAsState()
    val isRefreshing by viewModel.isRefreshing.collectAsState()

    PullToRefreshScreen(isRefreshing = isRefreshing, onRefresh = viewModel::refresh, modifier = Modifier.padding(padding).fillMaxSize()) {
        if (groups.isEmpty()) {
            EmptyState(
                emoji = "💡",
                message = "No ideas yet.\nSomething worth doing on this trip? Pin it here.",
                modifier = Modifier.align(Alignment.Center),
            )
        } else {
            LazyColumn(contentPadding = PaddingValues(16.dp)) {
                groups.forEach { group ->
                    item {
                        Text(
                            group.section?.let { buildString { if (it.emoji != null) append("${it.emoji} "); append(it.name) } } ?: "No Section",
                            style = MaterialTheme.typography.titleSmall,
                            color = TrailsColors.TextSoft,
                            modifier = Modifier.padding(top = 12.dp, bottom = 6.dp),
                        )
                    }
                    items(group.ideas, key = { it.idea.id }) { item ->
                        IdeaCompactCard(item, onClick = { onOpenIdea(item.idea.id) })
                    }
                }
            }
        }
    }
}

@Composable
private fun IdeaCompactCard(item: IdeaWithCoverPhoto, onClick: () -> Unit) {
    val idea = item.idea
    var expanded by remember { mutableStateOf(false) }

    ElevatedCard(
        modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp),
        shape = TrailsShapes.Card,
        colors = CardDefaults.elevatedCardColors(containerColor = TrailsColors.Surface),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 1.dp),
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.clickable(onClick = onClick)) {
                if (item.coverPhoto?.localPath != null) {
                    AsyncImage(
                        model = File(item.coverPhoto.localPath),
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.size(52.dp).clip(RoundedCornerShape(8.dp)),
                    )
                } else {
                    Box(modifier = Modifier.size(52.dp).background(TrailsColors.SurfaceCool, RoundedCornerShape(8.dp)))
                }
                Column(modifier = Modifier.padding(start = 12.dp).weight(1f)) {
                    Text(idea.title, style = MaterialTheme.typography.titleMedium, color = TrailsColors.Text)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 2.dp)) {
                        PriorityBadge(idea.priority)
                        Text(
                            WEATHER_LABELS[idea.weatherSuitability] ?: idea.weatherSuitability,
                            style = MaterialTheme.typography.bodySmall,
                            color = TrailsColors.TextSoft,
                        )
                        if (idea.estimatedExpenseAmount != null && idea.estimatedExpenseCurrency != null) {
                            Text(
                                "${idea.estimatedExpenseAmount} ${idea.estimatedExpenseCurrency}",
                                style = MaterialTheme.typography.bodySmall,
                                color = TrailsColors.TextSoft,
                            )
                        }
                    }
                }
            }

            val hasMore = idea.category != null || idea.locationAddress != null || idea.locationMapLink != null || idea.weatherTags.isNotEmpty()
            if (hasMore) {
                Text(
                    if (expanded) "Show less" else "Read more",
                    style = MaterialTheme.typography.bodySmall,
                    color = TrailsColors.BrandAccent,
                    modifier = Modifier.padding(top = 8.dp).clickable { expanded = !expanded },
                )
            }
            if (expanded) {
                Column(modifier = Modifier.padding(top = 6.dp)) {
                    idea.category?.let {
                        Text(it, style = MaterialTheme.typography.bodyMedium, color = TrailsColors.TextSoft, modifier = Modifier.padding(top = 2.dp))
                    }
                    idea.locationAddress?.let {
                        Text("📍 $it", style = MaterialTheme.typography.bodyMedium, color = TrailsColors.TextSoft, modifier = Modifier.padding(top = 2.dp))
                    }
                    idea.locationMapLink?.let { link ->
                        val context = androidx.compose.ui.platform.LocalContext.current
                        Text(
                            "Open in Google Maps",
                            style = MaterialTheme.typography.bodyMedium,
                            color = TrailsColors.BrandAccent,
                            modifier = Modifier.padding(top = 4.dp).clickable { com.trails.app.util.openExternalUrl(context, link) },
                        )
                    }
                    if (idea.weatherTags.isNotEmpty()) {
                        Row(modifier = Modifier.padding(top = 6.dp)) {
                            idea.weatherTags.forEach { tag ->
                                Surface(
                                    color = TrailsColors.SurfaceCool,
                                    contentColor = TrailsColors.TextSoft,
                                    shape = TrailsShapes.Pill,
                                    modifier = Modifier.padding(end = 6.dp),
                                ) {
                                    Text(tag, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp))
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
private fun PriorityBadge(priority: String) {
    val (bg, fg) = when (priority) {
        "MUST_DO" -> TrailsColors.BrandAccent to TrailsColors.TextOnDark
        "WOULD_LIKE" -> TrailsColors.BrandMint to TrailsColors.BrandDeep
        else -> TrailsColors.SurfaceCool to TrailsColors.TextSoft
    }
    Surface(color = bg, contentColor = fg, shape = TrailsShapes.Pill) {
        Text(
            PRIORITY_LABELS[priority] ?: priority,
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
        )
    }
}
