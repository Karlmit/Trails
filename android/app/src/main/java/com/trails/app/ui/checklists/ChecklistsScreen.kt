package com.trails.app.ui.checklists

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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.Icon
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
import com.trails.app.data.ChecklistWithItems
import com.trails.app.ui.components.EmptyState
import com.trails.app.ui.components.PullToRefreshScreen
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.ui.theme.TrailsShapes

/**
 * Mirrors app/(web)/trips/[tripId]/checklists/page.tsx's list, but kept
 * intentionally compact -- user-requested: "When I click on a checklist,
 * I should only see its items and title," which means this list card
 * itself only needs to show enough to recognize/pick a Checklist (title,
 * chosen emoji, Private badge, a packed-count summary), not the full Item
 * list inline any more. Tapping opens ChecklistDetailScreen.
 */
@Composable
fun ChecklistsScreen(padding: PaddingValues, onOpenChecklist: (String) -> Unit = {}, viewModel: ChecklistsViewModel = hiltViewModel()) {
    val checklists by viewModel.checklists.collectAsState(initial = emptyList())
    val isRefreshing by viewModel.isRefreshing.collectAsState()

    PullToRefreshScreen(isRefreshing = isRefreshing, onRefresh = viewModel::refresh, modifier = Modifier.padding(padding).fillMaxSize()) {
        if (checklists.isEmpty()) {
            EmptyState(
                emoji = "🧳",
                message = "No checklists yet.\nStart a packing list or a pre-departure to-do.",
                modifier = Modifier.align(Alignment.Center),
            )
        } else {
            Column {
                LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp)) {
                    items(checklists, key = { it.checklist.id }) { checklistWithItems ->
                        ChecklistCard(
                            checklistWithItems,
                            onOpen = { onOpenChecklist(checklistWithItems.checklist.id) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ChecklistCard(checklistWithItems: ChecklistWithItems, onOpen: () -> Unit) {
    val checkedCount = checklistWithItems.items.count { it.checked }
    ElevatedCard(
        modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp).clickable(onClick = onOpen),
        shape = TrailsShapes.Card,
        colors = CardDefaults.elevatedCardColors(containerColor = TrailsColors.Surface),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 1.dp),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    checklistWithItems.checklist.emoji?.takeIf { it.isNotBlank() } ?: "✅",
                    modifier = Modifier.padding(end = 8.dp),
                )
                Text(
                    checklistWithItems.checklist.title,
                    style = MaterialTheme.typography.titleMedium,
                    color = TrailsColors.Text,
                    modifier = Modifier.weight(1f),
                )
                if (checklistWithItems.checklist.isPrivate) {
                    Surface(color = TrailsColors.BrandMint, shape = TrailsShapes.Pill) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                        ) {
                            Icon(Icons.Filled.Lock, contentDescription = null, tint = TrailsColors.BrandDeep, modifier = Modifier.size(12.dp))
                            Text(
                                "Private",
                                style = MaterialTheme.typography.labelSmall,
                                color = TrailsColors.BrandDeep,
                                modifier = Modifier.padding(start = 4.dp),
                            )
                        }
                    }
                }
            }
            Text(
                "$checkedCount/${checklistWithItems.items.size} done",
                style = MaterialTheme.typography.bodyMedium,
                color = TrailsColors.TextSoft,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
    }
}
