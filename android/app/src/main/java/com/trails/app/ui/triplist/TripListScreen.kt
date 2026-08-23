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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.trails.app.data.entity.TripEntity
import com.trails.app.ui.components.ErrorBanner
import com.trails.app.ui.components.PillButton
import com.trails.app.ui.components.PillButtonVariant
import com.trails.app.ui.components.TrailsTopBar
import com.trails.app.ui.components.TripStatusBadge
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.ui.theme.TrailsShapes

@Composable
fun TripListScreen(
    onOpenTrip: (String) -> Unit,
    onAddTrip: () -> Unit = {},
    autoOpenActiveTrip: Boolean = false,
    onAutoOpenConsumed: () -> Unit = {},
    viewModel: TripListViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    // One-shot, per-app-entry only -- user-reported: "If a trip is active
    // the Android app automatically opens that trip's timeline." Consumed
    // immediately so a later manual visit to this screen (e.g. the drawer's
    // "All Trips" item) never bounces the user straight back into the
    // active trip. Only auto-opens when there's exactly one ACTIVE trip --
    // with more than one, which to jump into is ambiguous, so the list is
    // shown instead.
    LaunchedEffect(autoOpenActiveTrip, state.trips) {
        if (autoOpenActiveTrip && state.trips.isNotEmpty()) {
            onAutoOpenConsumed()
            val activeTrips = state.trips.filter { it.status == "ACTIVE" }
            if (activeTrips.size == 1) onOpenTrip(activeTrips[0].id)
        }
    }

    TripListContent(
        state = state,
        onOpenTrip = onOpenTrip,
        onAddTrip = onAddTrip,
        onSaveOffline = viewModel::saveOffline,
        onDismissSaveOfflineError = viewModel::dismissSaveOfflineError,
    )
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
    onDismissSaveOfflineError: (String) -> Unit = {},
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
                            hasSaveOfflineError = trip.id in state.saveOfflineErrorIds,
                            onClick = { onOpenTrip(trip.id) },
                            onSaveOffline = { onSaveOffline(trip.id) },
                            onDismissError = { onDismissSaveOfflineError(trip.id) },
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
    hasSaveOfflineError: Boolean,
    onClick: () -> Unit,
    onSaveOffline: () -> Unit,
    onDismissError: () -> Unit,
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
            if (hasSaveOfflineError) {
                ErrorBanner(
                    "Couldn't save this Trip offline -- check your connection and try again.",
                    modifier = Modifier.padding(top = 12.dp).clickable(onClick = onDismissError),
                )
            }
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                when {
                    isSavingOffline -> {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), color = TrailsColors.BrandAccent, strokeWidth = 2.dp)
                        Text(
                            "Saving Trip + files to this device…",
                            style = MaterialTheme.typography.bodySmall,
                            color = TrailsColors.TextSoft,
                            modifier = Modifier.padding(start = 8.dp),
                        )
                    }
                    // A plain filled badge, not a button -- it must read as a
                    // settled, confirmed status ("this trip's data and files
                    // are on this device right now"), not as something that
                    // might still be in progress or need a second tap to
                    // trust. User-reported: the old version (colored text
                    // that was ALSO the re-sync button) looked identical to
                    // "still working" and left it unclear whether the tap
                    // itself had done anything.
                    trip.cachedOffline -> {
                        androidx.compose.material3.Surface(
                            color = TrailsColors.BrandMint,
                            contentColor = TrailsColors.BrandDeep,
                            shape = com.trails.app.ui.theme.TrailsShapes.Pill,
                        ) {
                            Text(
                                "✓ Saved to this device",
                                style = MaterialTheme.typography.bodySmall,
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                            )
                        }
                        Text(
                            "Refresh",
                            style = MaterialTheme.typography.bodySmall,
                            color = TrailsColors.BrandAccent,
                            modifier = Modifier.padding(start = 12.dp).clickable(onClick = onSaveOffline),
                        )
                    }
                    else -> {
                        PillButton(text = "Save offline", variant = PillButtonVariant.Outline, onClick = onSaveOffline)
                    }
                }
            }
        }
    }
}
