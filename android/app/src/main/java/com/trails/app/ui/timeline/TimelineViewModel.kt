package com.trails.app.ui.timeline

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trails.app.data.TimelineRepository
import com.trails.app.data.TripRepository
import com.trails.app.data.entity.SectionEntity
import com.trails.app.data.entity.TimelineEntryEntity
import com.trails.app.data.entity.TripEntity
import com.trails.app.sync.SyncScheduler
import com.trails.app.ui.timeline.graph.EntryForLayout
import com.trails.app.ui.timeline.graph.SectionRange
import com.trails.app.ui.timeline.graph.TimelineLayout
import com.trails.app.ui.timeline.graph.buildTimelineDays
import com.trails.app.ui.timeline.graph.layoutTimelineEntries
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.ZoneId
import javax.inject.Inject

data class TimelineUiState(
    val trip: TripEntity? = null,
    val sections: List<SectionEntity> = emptyList(),
    val layout: TimelineLayout? = null,
    val todayKey: String? = null,
    val isSyncing: Boolean = false,
)

@HiltViewModel
class TimelineViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val tripRepository: TripRepository,
    private val timelineRepository: TimelineRepository,
    private val syncScheduler: SyncScheduler,
) : ViewModel() {

    val tripId: String = checkNotNull(savedStateHandle["tripId"]) { "TimelineScreen requires a tripId nav argument" }
    private val isSyncing = MutableStateFlow(false)

    val uiState: StateFlow<TimelineUiState> = combine(
        tripRepository.observeTrip(tripId),
        timelineRepository.observeSections(tripId),
        timelineRepository.observeEntries(tripId),
        isSyncing,
    ) { trip, sections, entries, syncing ->
        if (trip == null) {
            TimelineUiState(isSyncing = syncing)
        } else {
            val todayKey = todayKeyIfActive(trip)
            val sortedSections = sections.sortedBy { it.startDate }
            val days = buildTimelineDays(
                tripStartDateKey = trip.startDate,
                tripEndDateKey = trip.endDate,
                sections = sortedSections.map { SectionRange(it.id, it.startDate, it.endDate) },
                todayKey = todayKey,
            )
            val layout = layoutTimelineEntries(
                days,
                entries.map {
                    EntryForLayout(it.id, it.entryType, it.subtype, it.title, it.startAt, it.endAt, it.startTimezone, it.endTimezone, it.typeDetailsJson)
                },
            )
            TimelineUiState(trip = trip, sections = sortedSections, layout = layout, todayKey = todayKey, isSyncing = syncing)
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), TimelineUiState())

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            isSyncing.value = true
            val workId = syncScheduler.syncTripNow(tripId)
            syncScheduler.observeWork(workId).first { it == null || it.state.isFinished }
            isSyncing.value = false
        }
    }

    // AD-8: "today" is always computed in the Trip's own declared timezone,
    // never the device's local zone -- and only surfaced at all while the
    // Trip is actually ACTIVE (matches the web's own todayKey gating,
    // app/(web)/trips/[tripId]/timeline/page.tsx).
    private fun todayKeyIfActive(trip: TripEntity): String? {
        val todayInTripZone = runCatching {
            LocalDate.now(ZoneId.of(trip.timezone)).toString()
        }.getOrDefault(LocalDate.now().toString())
        if (todayInTripZone < trip.startDate || todayInTripZone > trip.endDate) return null
        return todayInTripZone
    }
}
