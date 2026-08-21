package com.trails.app.ui.triplist

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trails.app.data.TripRepository
import com.trails.app.data.entity.TripEntity
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class TripListUiState(
    val trips: List<TripEntity> = emptyList(),
    val isSyncing: Boolean = false,
    val syncError: String? = null,
)

@HiltViewModel
class TripListViewModel @Inject constructor(
    private val tripRepository: TripRepository,
) : ViewModel() {

    private data class SyncState(val isSyncing: Boolean, val error: String?)

    private val syncState = MutableStateFlow(SyncState(isSyncing = false, error = null))

    val uiState: StateFlow<TripListUiState> = combine(
        tripRepository.observeTrips(),
        syncState,
    ) { trips, sync ->
        TripListUiState(trips = trips, isSyncing = sync.isSyncing, syncError = sync.error)
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
}
