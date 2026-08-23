package com.trails.app.ui.importantinfo

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import com.trails.app.data.entity.ImportantInfoEntity
import com.trails.app.ui.components.EmptyState
import com.trails.app.ui.components.PullToRefreshScreen
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.ui.theme.TrailsShapes

/** Mirrors app/(web)/trips/[tripId]/important-info/page.tsx, plus create/edit via [onOpenItem]. */
@Composable
fun ImportantInfoScreen(padding: PaddingValues, onOpenItem: (String?) -> Unit = {}, viewModel: ImportantInfoViewModel = hiltViewModel()) {
    val items by viewModel.items.collectAsState(initial = emptyList())
    val isRefreshing by viewModel.isRefreshing.collectAsState()

    PullToRefreshScreen(isRefreshing = isRefreshing, onRefresh = viewModel::refresh, modifier = Modifier.padding(padding).fillMaxSize()) {
        if (items.isEmpty()) {
            EmptyState(
                emoji = "📌",
                message = "No important info yet.\nAddresses, references, the plan B -- keep it here.",
                modifier = Modifier.align(Alignment.Center),
            )
        } else {
            LazyColumn(contentPadding = PaddingValues(16.dp)) {
                items(items, key = { it.id }) { item -> ImportantInfoCard(item, onClick = { onOpenItem(item.id) }) }
            }
        }
    }
}

@Composable
private fun ImportantInfoCard(item: ImportantInfoEntity, onClick: () -> Unit) {
    ElevatedCard(
        modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp).clickable(onClick = onClick),
        shape = TrailsShapes.Card,
        colors = CardDefaults.elevatedCardColors(containerColor = TrailsColors.Surface),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 1.dp),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("📌 ${item.title}", style = MaterialTheme.typography.titleMedium, color = TrailsColors.Text)
            item.content?.let {
                Text(it, style = MaterialTheme.typography.bodyLarge, color = TrailsColors.Text, modifier = Modifier.padding(top = 6.dp))
            }
            item.locationName?.let {
                Text("📍 $it", style = MaterialTheme.typography.bodyMedium, color = TrailsColors.TextSoft, modifier = Modifier.padding(top = 6.dp))
            }
            if (item.contactName != null || item.contactPhone != null || item.contactEmail != null) {
                Text(
                    listOfNotNull(item.contactName, item.contactPhone, item.contactEmail).joinToString(" · "),
                    style = MaterialTheme.typography.bodyMedium,
                    color = TrailsColors.TextSoft,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
        }
    }
}
