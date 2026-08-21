package com.trails.app.ui.importantinfo

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
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
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.ui.theme.TrailsShapes

/** Mirrors app/(web)/trips/[tripId]/important-info/page.tsx. */
@Composable
fun ImportantInfoScreen(padding: PaddingValues, viewModel: ImportantInfoViewModel = hiltViewModel()) {
    val items by viewModel.items.collectAsState(initial = emptyList())

    Box(modifier = Modifier.padding(padding).fillMaxSize()) {
        if (items.isEmpty()) {
            Text(
                "No Important Info yet.",
                modifier = Modifier.align(Alignment.Center).padding(24.dp),
                color = TrailsColors.TextSoft,
            )
        } else {
            LazyColumn(contentPadding = PaddingValues(16.dp)) {
                items(items, key = { it.id }) { item -> ImportantInfoCard(item) }
            }
        }
    }
}

@Composable
private fun ImportantInfoCard(item: ImportantInfoEntity) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
        shape = TrailsShapes.Card,
        colors = CardDefaults.cardColors(containerColor = TrailsColors.Surface),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(item.title, style = MaterialTheme.typography.titleMedium, color = TrailsColors.Text)
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
