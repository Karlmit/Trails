package com.trails.app.ui.travelmode

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trails.app.data.TimelineRepository
import com.trails.app.data.TripRepository
import com.trails.app.data.entity.TimelineEntryEntity
import com.trails.app.sync.SyncScheduler
import com.trails.app.ui.timeline.graph.SectionRange
import com.trails.app.ui.timeline.graph.sectionIndexForDateKey
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import javax.inject.Inject

data class TravelModeUiState(
    val tripStatus: String? = null,
    val currentSectionName: String? = null,
    val currentStay: TimelineEntryEntity? = null,
    val currentActivity: TimelineEntryEntity? = null,
    val nextOverall: TimelineEntryEntity? = null,
    val nextTransport: TimelineEntryEntity? = null,
    val nextActivity: TimelineEntryEntity? = null,
    val nextStay: TimelineEntryEntity? = null,
    val todaysEntries: List<TimelineEntryEntity> = emptyList(),
)

@HiltViewModel
class TravelModeViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    tripRepository: TripRepository,
    timelineRepository: TimelineRepository,
    syncScheduler: SyncScheduler,
) : ViewModel() {
    private val tripId: String = checkNotNull(savedStateHandle["tripId"])

    // See ChecklistsViewModel's identical init block -- this screen had no
    // sync trigger of its own before, only ever refreshed as a side effect
    // of the Timeline tab having synced first. Especially relevant here --
    // Travel Mode is meant to reflect what's happening *right now*.
    init {
        viewModelScope.launch { syncScheduler.syncTripNow(tripId) }
    }

    val uiState: StateFlow<TravelModeUiState> = combine(
        tripRepository.observeTrip(tripId),
        timelineRepository.observeSections(tripId),
        timelineRepository.observeEntries(tripId),
    ) { trip, sections, entries ->
        if (trip == null) return@combine TravelModeUiState()
        val now = Instant.now()
        val todayKey = now.atZone(ZoneId.of(trip.timezone)).toLocalDate().toString()
        val status = when {
            todayKey < trip.startDate -> "UPCOMING"
            todayKey > trip.endDate -> "COMPLETED"
            else -> "ACTIVE"
        }
        if (status != "ACTIVE") return@combine TravelModeUiState(tripStatus = status)

        val sectionIndex = sectionIndexForDateKey(todayKey, sections.map { SectionRange(it.id, it.startDate, it.endDate) })
        val todaysEntries = entries
            .filter { it.startAt.substring(0, 10) == todayKey }
            .sortedBy { it.startAt }

        TravelModeUiState(
            tripStatus = status,
            currentSectionName = sectionIndex?.let { sections.getOrNull(it)?.name },
            currentStay = findCurrentStay(entries, now, trip.timezone),
            currentActivity = findCurrentActivity(entries, now, trip.timezone),
            nextOverall = findNextByType(entries, now, trip.timezone),
            nextTransport = findNextByType(entries, now, trip.timezone, "TRANSPORT"),
            nextActivity = findNextByType(entries, now, trip.timezone, "ACTIVITY"),
            nextStay = findNextByType(entries, now, trip.timezone, "STAY"),
            todaysEntries = todaysEntries,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), TravelModeUiState())
}
