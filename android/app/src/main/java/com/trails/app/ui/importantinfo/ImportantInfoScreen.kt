package com.trails.app.ui.importantinfo

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.trails.app.R
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
                message = stringResource(R.string.info_empty_state),
                modifier = Modifier.align(Alignment.Center),
            )
        } else {
            // Already ordered by sortOrder (ImportantInfoDao.observeForTrip)
            // -- index here is exactly what decides isFirst/isLast for the
            // move buttons.
            LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp)) {
                itemsIndexed(items, key = { _, item -> item.id }) { index, item ->
                    ImportantInfoCard(
                        item,
                        isFirst = index == 0,
                        isLast = index == items.size - 1,
                        onClick = { onOpenItem(item.id) },
                        onMove = { direction -> viewModel.move(item.id, direction) },
                    )
                }
            }
        }
    }
}

@Composable
private fun ImportantInfoCard(
    item: ImportantInfoEntity,
    isFirst: Boolean,
    isLast: Boolean,
    onClick: () -> Unit,
    onMove: (String) -> Unit,
) {
    ElevatedCard(
        modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
        shape = TrailsShapes.Card,
        colors = CardDefaults.elevatedCardColors(containerColor = TrailsColors.Surface),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 1.dp),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "${item.emoji?.takeIf { it.isNotBlank() } ?: "📌"} ${item.title}",
                    style = MaterialTheme.typography.titleMedium,
                    color = TrailsColors.Text,
                    modifier = Modifier.weight(1f).clickable(onClick = onClick),
                )
                Row(horizontalArrangement = Arrangement.spacedBy((-8).dp)) {
                    IconButton(onClick = { onMove("up") }, enabled = !isFirst) {
                        Icon(Icons.Filled.KeyboardArrowUp, contentDescription = stringResource(R.string.info_move_up_description), tint = if (isFirst) TrailsColors.TextSoft else TrailsColors.Brand)
                    }
                    IconButton(onClick = { onMove("down") }, enabled = !isLast) {
                        Icon(Icons.Filled.KeyboardArrowDown, contentDescription = stringResource(R.string.info_move_down_description), tint = if (isLast) TrailsColors.TextSoft else TrailsColors.Brand)
                    }
                }
            }
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
