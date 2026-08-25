package com.trails.app.ui.triplist

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkInfo
import com.trails.app.R
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
    // Dynamic, exception-provided sync error text -- takes precedence over
    // [syncErrorRes] when non-null.
    val syncError: String? = null,
    // Known, statically-translated sync error case -- resolved to text by
    // the Composable via stringResource(), since a ViewModel can't call it.
    @StringRes val syncErrorRes: Int? = null,
    // tripId -> currently running a "Save offline" full sync.
    val savingOfflineIds: Set<String> = emptySet(),
    // tripId -> the last "Save offline" attempt for it actually failed --
    // user-reported: no confirmation either way before this, so a failed
    // sync looked identical to a successful one once the spinner cleared.
    val saveOfflineErrorIds: Set<String> = emptySet(),
)

@HiltViewModel
class TripListViewModel @Inject constructor(
    private val tripRepository: TripRepository,
    private val syncScheduler: SyncScheduler,
) : ViewModel() {

    private data class SyncState(val isSyncing: Boolean, val error: String?, @StringRes val errorRes: Int? = null)

    private val syncState = MutableStateFlow(SyncState(isSyncing = false, error = null))
    private val savingOfflineIds = MutableStateFlow<Set<String>>(emptySet())
    private val saveOfflineErrorIds = MutableStateFlow<Set<String>>(emptySet())

    val uiState: StateFlow<TripListUiState> = combine(
        tripRepository.observeTrips(),
        syncState,
        savingOfflineIds,
        saveOfflineErrorIds,
    ) { trips, sync, saving, saveErrors ->
        TripListUiState(
            trips = trips,
            isSyncing = sync.isSyncing,
            syncError = sync.error,
            syncErrorRes = sync.errorRes,
            savingOfflineIds = saving,
            saveOfflineErrorIds = saveErrors,
        )
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
                syncState.value = SyncState(
                    isSyncing = false,
                    error = e.message,
                    errorRes = if (e.message == null) R.string.shell_trip_sync_error else null,
                )
            }
        }
    }

    /** The explicit "Save offline" action -- a full TripSyncCoordinator pass (via SyncTripWorker), same one Timeline triggers on open, just user-initiated from here instead. */
    fun saveOffline(tripId: String) {
        viewModelScope.launch {
            savingOfflineIds.value = savingOfflineIds.value + tripId
            saveOfflineErrorIds.value = saveOfflineErrorIds.value - tripId
            val workId = syncScheduler.syncTripNow(tripId)
            val finished = syncScheduler.observeWork(workId).first { it == null || it.state.isFinished }
            // WorkInfo reaching "finished" only means the job stopped, not
            // that it succeeded -- a real network/API failure previously
            // looked identical to success once the spinner cleared (user-
            // reported: "I want to be sure it's actually saved offline").
            if (finished == null || finished.state != WorkInfo.State.SUCCEEDED) {
                saveOfflineErrorIds.value = saveOfflineErrorIds.value + tripId
            }
            savingOfflineIds.value = savingOfflineIds.value - tripId
        }
    }

    fun dismissSaveOfflineError(tripId: String) {
        saveOfflineErrorIds.value = saveOfflineErrorIds.value - tripId
    }
}
