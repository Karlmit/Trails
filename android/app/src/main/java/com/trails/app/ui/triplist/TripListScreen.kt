package com.trails.app.ui.triplist

import androidx.compose.foundation.clickable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
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
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.trails.app.data.entity.TripEntity
import com.trails.app.ui.components.TrailsTopBar
import com.trails.app.ui.components.TripStatusBadge
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.ui.theme.TrailsShapes

@Composable
fun TripListScreen(
    onOpenTrip: (String) -> Unit,
    onAddTrip: () -> Unit = {},
    viewModel: TripListViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    TripListContent(state = state, onOpenTrip = onOpenTrip, onAddTrip = onAddTrip, onSaveOffline = viewModel::saveOffline)
}

/**
 * Stateless presentation layer, deliberately split out from [TripListScreen]
 * so it can be exercised directly -- by a Compose preview, or by a Paparazzi
 * screenshot test (app/src/test/.../ui/triplist/TripListContentScreenshotTest.kt)
 * -- with no Hilt/ViewModel/Room graph required. Mirrors
 * app/(web)/trips/page.tsx's `.trip-card-grid`/`.trip-card`.
 */
@Composable
fun TripListContent(
    state: TripListUiState,
    onOpenTrip: (String) -> Unit,
    onAddTrip: () -> Unit = {},
    onSaveOffline: (String) -> Unit = {},
) {
    Scaffold(
        containerColor = TrailsColors.Canvas,
        topBar = { TrailsTopBar() },
        floatingActionButton = {
            androidx.compose.material3.FloatingActionButton(onClick = onAddTrip) {
                androidx.compose.material3.Icon(Icons.Filled.Add, contentDescription = "New Trip")
            }
        },
    ) { padding ->
        Box(modifier = Modifier.padding(padding).fillMaxSize()) {
            if (state.trips.isEmpty() && state.isSyncing) {
                CircularProgressIndicator(
                    modifier = Modifier.align(Alignment.Center),
                    color = TrailsColors.BrandAccent,
                )
            } else if (state.trips.isEmpty()) {
                Text(
                    state.syncError ?: "No trips yet. Create your first Trip to start building a Timeline.",
                    modifier = Modifier.align(Alignment.Center).padding(24.dp),
                    color = TrailsColors.TextSoft,
                )
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(state.trips, key = { it.id }) { trip: TripEntity ->
                        TripCard(
                            trip = trip,
                            isSavingOffline = trip.id in state.savingOfflineIds,
                            onClick = { onOpenTrip(trip.id) },
                            onSaveOffline = { onSaveOffline(trip.id) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun TripCard(
    trip: TripEntity,
    isSavingOffline: Boolean,
    onClick: () -> Unit,
    onSaveOffline: () -> Unit,
) {
    ElevatedCard(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
        shape = TrailsShapes.Card,
        colors = CardDefaults.elevatedCardColors(containerColor = TrailsColors.Surface),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 1.dp),
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(trip.name, style = MaterialTheme.typography.titleMedium, color = TrailsColors.Text)
                TripStatusBadge(trip.status)
            }
            trip.destination?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.bodyMedium,
                    color = TrailsColors.TextSoft,
                    modifier = Modifier.padding(top = 6.dp),
                )
            }
            Text(
                "${trip.startDate} → ${trip.endDate} · ${trip.durationDays} days",
                style = MaterialTheme.typography.bodySmall,
                color = TrailsColors.TextSoft,
                modifier = Modifier.padding(top = 4.dp),
            )
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                when {
                    isSavingOffline -> {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), color = TrailsColors.BrandAccent, strokeWidth = 2.dp)
                        Text(
                            "Saving offline…",
                            style = MaterialTheme.typography.bodySmall,
                            color = TrailsColors.TextSoft,
                            modifier = Modifier.padding(start = 8.dp),
                        )
                    }
                    trip.cachedOffline -> {
                        Text(
                            "✓ Available offline",
                            style = MaterialTheme.typography.bodySmall,
                            color = TrailsColors.BrandAccent,
                            modifier = Modifier.clickable(onClick = onSaveOffline),
                        )
                    }
                    else -> {
                        Text(
                            "⬇ Save offline",
                            style = MaterialTheme.typography.bodySmall,
                            color = TrailsColors.BrandAccent,
                            modifier = Modifier.clickable(onClick = onSaveOffline),
                        )
                    }
                }
            }
        }
    }
}
