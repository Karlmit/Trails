package com.trails.app.ui.ideas

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
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
import com.trails.app.data.entity.IdeaEntity
import com.trails.app.data.weatherTags
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.ui.theme.TrailsShapes

private val PRIORITY_LABELS = mapOf("MUST_DO" to "Must do", "WOULD_LIKE" to "Would like", "MAYBE" to "Maybe")

/** Mirrors app/(web)/trips/[tripId]/ideas/page.tsx (filters not built -- full list only). */
@Composable
fun IdeasScreen(padding: PaddingValues, viewModel: IdeasViewModel = hiltViewModel()) {
    val ideas by viewModel.ideas.collectAsState(initial = emptyList())

    Box(modifier = Modifier.padding(padding).fillMaxSize()) {
        if (ideas.isEmpty()) {
            Text("No Ideas yet.", modifier = Modifier.align(Alignment.Center).padding(24.dp), color = TrailsColors.TextSoft)
        } else {
            LazyColumn(contentPadding = PaddingValues(16.dp)) {
                items(ideas, key = { it.id }) { idea -> IdeaCard(idea) }
            }
        }
    }
}

@Composable
private fun IdeaCard(idea: IdeaEntity) {
    val (badgeBg, badgeFg) = when (idea.priority) {
        "MUST_DO" -> TrailsColors.BrandAccent to TrailsColors.TextOnDark
        "WOULD_LIKE" -> TrailsColors.BrandMint to TrailsColors.BrandDeep
        else -> TrailsColors.SurfaceCool to TrailsColors.TextSoft
    }
    Card(
        modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
        shape = TrailsShapes.Card,
        colors = CardDefaults.cardColors(containerColor = TrailsColors.Surface),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = androidx.compose.foundation.layout.Arrangement.SpaceBetween) {
                Text(idea.title, style = MaterialTheme.typography.titleMedium, color = TrailsColors.Text)
                Surface(color = badgeBg, contentColor = badgeFg, shape = TrailsShapes.Pill) {
                    Text(
                        PRIORITY_LABELS[idea.priority] ?: idea.priority,
                        style = MaterialTheme.typography.labelMedium,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 3.dp),
                    )
                }
            }
            idea.category?.let {
                Text(it, style = MaterialTheme.typography.bodyMedium, color = TrailsColors.TextSoft, modifier = Modifier.padding(top = 4.dp))
            }
            idea.locationName?.let {
                Text("📍 $it", style = MaterialTheme.typography.bodyMedium, color = TrailsColors.TextSoft, modifier = Modifier.padding(top = 4.dp))
            }
            if (idea.weatherTags.isNotEmpty()) {
                Row(modifier = Modifier.padding(top = 8.dp)) {
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
            if (idea.estimatedExpenseAmount != null && idea.estimatedExpenseCurrency != null) {
                Text(
                    "Est. ${idea.estimatedExpenseAmount} ${idea.estimatedExpenseCurrency}",
                    style = MaterialTheme.typography.bodySmall,
                    color = TrailsColors.TextSoft,
                    modifier = Modifier.padding(top = 6.dp),
                )
            }
        }
    }
}
