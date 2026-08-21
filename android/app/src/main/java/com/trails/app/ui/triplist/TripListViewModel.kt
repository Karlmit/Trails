package com.trails.app.ui.triplist

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trails.app.data.TripRepository
import com.trails.app.data.entity.TripEntity
import com.trails.app.sync.SyncScheduler
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class TripListUiState(
    val trips: List<TripEntity> = emptyList(),
    val isSyncing: Boolean = false,
    val syncError: String? = null,
    // tripId -> currently running a "Save offline" full sync.
    val savingOfflineIds: Set<String> = emptySet(),
)

@HiltViewModel
class TripListViewModel @Inject constructor(
    private val tripRepository: TripRepository,
    private val syncScheduler: SyncScheduler,
) : ViewModel() {

    private data class SyncState(val isSyncing: Boolean, val error: String?)

    private val syncState = MutableStateFlow(SyncState(isSyncing = false, error = null))
    private val savingOfflineIds = MutableStateFlow<Set<String>>(emptySet())

    val uiState: StateFlow<TripListUiState> = combine(
        tripRepository.observeTrips(),
        syncState,
        savingOfflineIds,
    ) { trips, sync, saving ->
        TripListUiState(trips = trips, isSyncing = sync.isSyncing, syncError = sync.error, savingOfflineIds = saving)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), TripListUiState())

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            syncState.value = SyncState(isSyncing = true, error = null)
            try {
                tripRepository.syncTrips()
                syncState.value = SyncState(isSyncing = false, error = null)
            } catch (e: Exception) {
                // A failed refresh while offline is expected, not fatal --
                // whatever trips are already cached below stay fully usable.
                syncState.value = SyncState(isSyncing = false, error = e.message ?: "Could not refresh trips")
            }
        }
    }

    /** The explicit "Save offline" action -- a full TripSyncCoordinator pass (via SyncTripWorker), same one Timeline triggers on open, just user-initiated from here instead. */
    fun saveOffline(tripId: String) {
        viewModelScope.launch {
            savingOfflineIds.value = savingOfflineIds.value + tripId
            val workId = syncScheduler.syncTripNow(tripId)
            syncScheduler.observeWork(workId).first { it == null || it.state.isFinished }
            savingOfflineIds.value = savingOfflineIds.value - tripId
        }
    }
}
