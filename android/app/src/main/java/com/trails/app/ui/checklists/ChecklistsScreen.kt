package com.trails.app.ui.checklists

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
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.trails.app.data.ChecklistWithItems
import com.trails.app.ui.components.ErrorBanner
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.ui.theme.TrailsShapes

/** Mirrors app/(web)/trips/[tripId]/checklists/page.tsx -- toggling an item is the one online-only write this app supports offline-first otherwise. */
@Composable
fun ChecklistsScreen(padding: PaddingValues, viewModel: ChecklistsViewModel = hiltViewModel()) {
    val checklists by viewModel.checklists.collectAsState(initial = emptyList())
    val error by viewModel.error.collectAsState()

    Box(modifier = Modifier.padding(padding).fillMaxSize()) {
        if (checklists.isEmpty()) {
            Text(
                "No Checklists yet.",
                modifier = Modifier.align(Alignment.Center).padding(24.dp),
                color = TrailsColors.TextSoft,
            )
        } else {
            Column {
                error?.let {
                    ErrorBanner(it, modifier = Modifier.padding(12.dp))
                }
                LazyColumn(contentPadding = PaddingValues(16.dp)) {
                    items(checklists, key = { it.checklist.id }) { checklistWithItems ->
                        ChecklistCard(checklistWithItems, onToggle = viewModel::setChecked)
                    }
                }
            }
        }
    }
}

@Composable
private fun ChecklistCard(checklistWithItems: ChecklistWithItems, onToggle: (String, Boolean) -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
        shape = TrailsShapes.Card,
        colors = CardDefaults.cardColors(containerColor = TrailsColors.Surface),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(checklistWithItems.checklist.title, style = MaterialTheme.typography.titleMedium, color = TrailsColors.Text)
            checklistWithItems.checklist.description?.let {
                Text(it, style = MaterialTheme.typography.bodyMedium, color = TrailsColors.TextSoft, modifier = Modifier.padding(top = 2.dp))
            }
            checklistWithItems.items.forEach { item ->
                Row(
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Checkbox(
                        checked = item.checked,
                        onCheckedChange = { checked -> onToggle(item.id, checked) },
                        colors = CheckboxDefaults.colors(checkedColor = TrailsColors.BrandAccent),
                    )
                    Column {
                        Text(
                            item.text,
                            style = MaterialTheme.typography.bodyLarge,
                            color = if (item.checked) TrailsColors.TextSoft else TrailsColors.Text,
                            textDecoration = if (item.checked) TextDecoration.LineThrough else null,
                        )
                        item.note?.let {
                            Text(it, style = MaterialTheme.typography.bodySmall, color = TrailsColors.TextSoft)
                        }
                    }
                }
            }
        }
    }
}
