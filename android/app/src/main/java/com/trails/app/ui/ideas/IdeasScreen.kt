package com.trails.app.ui.ideas

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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import coil3.compose.AsyncImage
import com.trails.app.R
import com.trails.app.data.entity.SectionEntity
import com.trails.app.ui.components.DropdownField
import com.trails.app.ui.components.EmptyState
import com.trails.app.ui.components.PullToRefreshScreen
import com.trails.app.ui.components.TrailsCard
import com.trails.app.ui.sections.SectionsViewModel
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.ui.theme.TrailsShapes
import java.io.File

/** Mirrors app/(web)/trips/[tripId]/ideas/page.tsx's default Section grouping + Priority/Section/Category/Weather filters, plus create/edit via [onOpenIdea]. */
@Composable
fun IdeasScreen(
    padding: PaddingValues,
    onOpenIdea: (String) -> Unit = {},
    viewModel: IdeasViewModel = hiltViewModel(),
    sectionsViewModel: SectionsViewModel = hiltViewModel(),
) {
    val groups by viewModel.groups.collectAsState()
    val isRefreshing by viewModel.isRefreshing.collectAsState()
    val filters by viewModel.filters.collectAsState()
    val categoryOptions by viewModel.categoryOptions.collectAsState()
    val hasAnyIdeas by viewModel.hasAnyIdeas.collectAsState()
    val sections by sectionsViewModel.sections.collectAsState(initial = emptyList())

    PullToRefreshScreen(isRefreshing = isRefreshing, onRefresh = viewModel::refresh, modifier = Modifier.padding(padding).fillMaxSize()) {
        // User-requested: the filter bar must scroll away with the rest of
        // the list, not stay pinned over the results -- it's the LazyColumn's
        // own first item (not a fixed header above it), same as every other
        // item, so it scrolls out of view once the user scrolls down and is
        // only visible again after scrolling back to the top.
        if (groups.isEmpty()) {
            Column(modifier = Modifier.fillMaxSize()) {
                IdeaFilterBar(
                    filters = filters,
                    sections = sections,
                    categoryOptions = categoryOptions,
                    onPriorityChange = viewModel::onPriorityFilterChange,
                    onSectionChange = viewModel::onSectionFilterChange,
                    onCategoryChange = viewModel::onCategoryFilterChange,
                    onWeatherChange = viewModel::onWeatherFilterChange,
                    onClear = viewModel::clearFilters,
                    modifier = Modifier.padding(16.dp),
                )
                Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                    EmptyState(
                        emoji = "💡",
                        message = if (hasAnyIdeas) stringResource(R.string.idea_empty_state_no_match) else stringResource(R.string.idea_empty_message),
                        modifier = Modifier.align(Alignment.Center),
                    )
                }
            }
        } else {
            val noSectionLabel = stringResource(R.string.idea_no_section_label)
            LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp)) {
                item {
                    IdeaFilterBar(
                        filters = filters,
                        sections = sections,
                        categoryOptions = categoryOptions,
                        onPriorityChange = viewModel::onPriorityFilterChange,
                        onSectionChange = viewModel::onSectionFilterChange,
                        onCategoryChange = viewModel::onCategoryFilterChange,
                        onWeatherChange = viewModel::onWeatherFilterChange,
                        onClear = viewModel::clearFilters,
                    )
                }
                groups.forEach { group ->
                    item {
                        Text(
                            group.section?.let { buildString { if (it.emoji != null) append("${it.emoji} "); append(it.name) } } ?: noSectionLabel,
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
private fun IdeaFilterBar(
    filters: IdeaFilters,
    sections: List<SectionEntity>,
    categoryOptions: List<String>,
    onPriorityChange: (String?) -> Unit,
    onSectionChange: (String?) -> Unit,
    onCategoryChange: (String?) -> Unit,
    onWeatherChange: (String?) -> Unit,
    onClear: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val allLabel = stringResource(R.string.idea_filter_all_option)
    val priorityLabels = IDEA_PRIORITY_LABEL_RES.mapValues { (_, resId) -> stringResource(resId) }
    val weatherLabels = IDEA_WEATHER_LABEL_RES.mapValues { (_, resId) -> stringResource(resId) }

    TrailsCard(modifier = modifier) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            DropdownField(
                label = stringResource(R.string.idea_edit_label_priority),
                options = listOf(null) + IDEA_PRIORITIES,
                selected = filters.priority,
                onSelected = onPriorityChange,
                optionLabel = { value -> value?.let { priorityLabels[it] } ?: allLabel },
                modifier = Modifier.weight(1f),
            )
            DropdownField(
                label = stringResource(R.string.idea_edit_label_section),
                options = listOf(null) + sections.map { it.id },
                selected = filters.sectionId,
                onSelected = onSectionChange,
                optionLabel = { id -> id?.let { sid -> sections.find { it.id == sid }?.let { "${it.emoji.orEmpty()} ${it.name}".trim() } ?: sid } ?: allLabel },
                modifier = Modifier.weight(1f),
            )
        }
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            DropdownField(
                label = stringResource(R.string.idea_edit_label_category),
                options = listOf(null) + categoryOptions,
                selected = filters.category,
                onSelected = onCategoryChange,
                optionLabel = { it ?: allLabel },
                modifier = Modifier.weight(1f),
            )
            DropdownField(
                label = stringResource(R.string.idea_edit_label_weather),
                options = listOf(null) + IDEA_WEATHER_SUITABILITY,
                selected = filters.weatherSuitability,
                onSelected = onWeatherChange,
                optionLabel = { value -> value?.let { weatherLabels[it] } ?: allLabel },
                modifier = Modifier.weight(1f),
            )
        }
        if (filters != IdeaFilters()) {
            Text(
                stringResource(R.string.idea_filter_clear),
                style = MaterialTheme.typography.bodySmall,
                color = TrailsColors.BrandAccent,
                modifier = Modifier.clickable(onClick = onClear),
            )
        }
    }
}

@Composable
private fun IdeaCompactCard(item: IdeaWithCoverPhoto, onClick: () -> Unit) {
    val idea = item.idea

    ElevatedCard(
        modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp).clickable(onClick = onClick),
        shape = TrailsShapes.Card,
        colors = CardDefaults.elevatedCardColors(containerColor = TrailsColors.Surface),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 1.dp),
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                // User-requested: no cover photo means no placeholder box --
                // the empty gray square added nothing, so the text content
                // just starts at the card's own left edge instead.
                if (item.coverPhoto?.localPath != null) {
                    AsyncImage(
                        model = File(item.coverPhoto.localPath),
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.size(52.dp).clip(RoundedCornerShape(8.dp)),
                    )
                }
                Column(modifier = Modifier.padding(start = if (item.coverPhoto?.localPath != null) 12.dp else 0.dp).weight(1f)) {
                    Text(idea.title, style = MaterialTheme.typography.titleMedium, color = TrailsColors.Text)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 2.dp)) {
                        PriorityBadge(idea.priority)
                        Text(
                            IDEA_WEATHER_LABEL_RES[idea.weatherSuitability]?.let { stringResource(it) } ?: idea.weatherSuitability,
                            style = MaterialTheme.typography.bodySmall,
                            color = TrailsColors.TextSoft,
                        )
                    }
                    // User-requested: Category shown directly in the list,
                    // no longer tucked behind a "Read more" toggle.
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 2.dp)) {
                        idea.category?.let {
                            Text(it, style = MaterialTheme.typography.bodySmall, color = TrailsColors.TextSoft)
                        }
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

            // User-requested: Description shows always, not tucked behind
            // "Read more" -- same "shown unconditionally in view mode"
            // choice web's IdeaCard makes for this field. Everything else
            // that used to hide behind "Read more" (Location/Map link,
            // Links, Photos) now lives on the tap destination, IdeaDetailScreen.
            idea.description?.let {
                Text(it, style = MaterialTheme.typography.bodyMedium, color = TrailsColors.TextSoft, modifier = Modifier.padding(top = 6.dp))
            }
        }
    }
}

@Composable
internal fun PriorityBadge(priority: String) {
    val (bg, fg) = when (priority) {
        "MUST_DO" -> TrailsColors.BrandAccent to TrailsColors.TextOnDark
        "WOULD_LIKE" -> TrailsColors.BrandMint to TrailsColors.BrandDeep
        else -> TrailsColors.SurfaceCool to TrailsColors.TextSoft
    }
    Surface(color = bg, contentColor = fg, shape = TrailsShapes.Pill) {
        Text(
            IDEA_PRIORITY_LABEL_RES[priority]?.let { stringResource(it) } ?: priority,
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
        )
    }
}
