package com.trails.app.ui.overview

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
import androidx.lifecycle.viewModelScope
import com.trails.app.data.TripRepository
import com.trails.app.data.entity.TripEntity
import com.trails.app.sync.SyncScheduler
import com.trails.app.sync.TripRefresher
import com.trails.app.ui.components.PillButton
import com.trails.app.ui.components.PillButtonVariant
import com.trails.app.ui.components.PullToRefreshScreen
import com.trails.app.ui.components.ScreenHeading
import com.trails.app.ui.components.TrailsCard
import com.trails.app.ui.components.TripStatusBadge
import com.trails.app.ui.theme.TrailsColors
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import javax.inject.Inject

@HiltViewModel
class OverviewViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    tripRepository: TripRepository,
    syncScheduler: SyncScheduler,
) : ViewModel() {
    private val tripId: String = checkNotNull(savedStateHandle["tripId"])
    val trip: Flow<TripEntity?> = tripRepository.observeTrip(tripId)

    private val refresher = TripRefresher(viewModelScope, tripId, syncScheduler)
    val isRefreshing: StateFlow<Boolean> = refresher.isRefreshing
    fun refresh() = refresher.refresh()

    init {
        refresh()
    }
}

/** Mirrors app/(web)/trips/[tripId]/overview/page.tsx + components/TripOverviewPanel.tsx, plus an Edit entry point via [onEdit]. */
@Composable
fun OverviewScreen(padding: PaddingValues, onEdit: () -> Unit = {}, viewModel: OverviewViewModel = hiltViewModel()) {
    val trip by viewModel.trip.collectAsState(initial = null)
    val isRefreshing by viewModel.isRefreshing.collectAsState()

    PullToRefreshScreen(isRefreshing = isRefreshing, onRefresh = viewModel::refresh, modifier = Modifier.padding(padding).fillMaxSize()) {
        val t = trip
        if (t == null) {
            Text("Loading…", modifier = Modifier.align(Alignment.Center), color = TrailsColors.TextSoft)
        } else {
            Column(
                modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                TrailsCard {
                    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        ScreenHeading(emoji = "🗺️", title = t.name, modifier = Modifier.weight(1f))
                        TripStatusBadge(t.status)
                    }
                    t.destination?.let {
                        Text(it, style = MaterialTheme.typography.bodyLarge, color = TrailsColors.Text)
                    }
                    Text(
                        "${t.startDate} → ${t.endDate} · ${t.durationDays} days",
                        style = MaterialTheme.typography.bodyMedium,
                        color = TrailsColors.TextSoft,
                    )
                    Text(
                        "Timezone: ${t.timezone}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = TrailsColors.TextSoft,
                    )
                    t.description?.let {
                        Text(it, style = MaterialTheme.typography.bodyLarge, color = TrailsColors.Text, modifier = Modifier.padding(top = 8.dp))
                    }
                    PillButton(text = "Edit trip", variant = PillButtonVariant.Outline, onClick = onEdit, modifier = Modifier.fillMaxWidth())
                }
            }
        }
    }
}
