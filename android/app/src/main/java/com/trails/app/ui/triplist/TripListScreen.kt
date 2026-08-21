package com.trails.app.ui.triplist

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ListItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.trails.app.data.entity.TripEntity

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TripListScreen(
    onOpenTrip: (String) -> Unit,
    viewModel: TripListViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    TripListContent(state = state, onOpenTrip = onOpenTrip)
}

/**
 * Stateless presentation layer, deliberately split out from [TripListScreen]
 * so it can be exercised directly -- by a Compose preview, or by a Paparazzi
 * screenshot test (app/src/test/.../ui/triplist/TripListContentScreenshotTest.kt)
 * -- with no Hilt/ViewModel/Room graph required.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TripListContent(state: TripListUiState, onOpenTrip: (String) -> Unit) {
    Scaffold(
        topBar = { TopAppBar(title = { Text("Trips") }) },
    ) { padding ->
        Box(modifier = Modifier.padding(padding).fillMaxSize()) {
            if (state.trips.isEmpty() && state.isSyncing) {
                CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
            } else if (state.trips.isEmpty()) {
                Text(
                    state.syncError ?: "No trips yet",
                    modifier = Modifier.align(Alignment.Center).padding(24.dp),
                )
            } else {
                LazyColumn {
                    items(state.trips, key = { it.id }) { trip: TripEntity ->
                        ListItem(
                            headlineContent = { Text(trip.name) },
                            supportingContent = { Text(trip.destination ?: trip.status) },
                            modifier = Modifier.clickable { onOpenTrip(trip.id) },
                        )
                    }
                }
            }
        }
    }
}
