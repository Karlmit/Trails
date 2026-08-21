package com.trails.app.ui.overview

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import com.trails.app.data.TripRepository
import com.trails.app.data.entity.TripEntity
import com.trails.app.ui.components.TripStatusBadge
import com.trails.app.ui.theme.TrailsColors
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

@HiltViewModel
class OverviewViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    tripRepository: TripRepository,
) : ViewModel() {
    private val tripId: String = checkNotNull(savedStateHandle["tripId"])
    val trip: Flow<TripEntity?> = tripRepository.observeTrip(tripId)
}

/** Mirrors app/(web)/trips/[tripId]/overview/page.tsx + components/TripOverviewPanel.tsx (read-only; editing requires connectivity, not built yet). */
@Composable
fun OverviewScreen(padding: PaddingValues, viewModel: OverviewViewModel = hiltViewModel()) {
    val trip by viewModel.trip.collectAsState(initial = null)

    Box(modifier = Modifier.padding(padding).fillMaxSize()) {
        val t = trip
        if (t == null) {
            Text("Loading…", modifier = Modifier.align(Alignment.Center), color = TrailsColors.TextSoft)
        } else {
            Column(modifier = Modifier.padding(20.dp)) {
                Text(t.name, style = MaterialTheme.typography.titleLarge, color = TrailsColors.Brand)
                TripStatusBadge(t.status)
                t.destination?.let {
                    Text(it, style = MaterialTheme.typography.bodyLarge, color = TrailsColors.Text, modifier = Modifier.padding(top = 10.dp))
                }
                Text(
                    "${t.startDate} → ${t.endDate} · ${t.durationDays} days",
                    style = MaterialTheme.typography.bodyMedium,
                    color = TrailsColors.TextSoft,
                    modifier = Modifier.padding(top = 4.dp),
                )
                Text(
                    "Timezone: ${t.timezone}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = TrailsColors.TextSoft,
                    modifier = Modifier.padding(top = 4.dp),
                )
                t.description?.let {
                    Text(it, style = MaterialTheme.typography.bodyLarge, color = TrailsColors.Text, modifier = Modifier.padding(top = 16.dp))
                }
            }
        }
    }
}
