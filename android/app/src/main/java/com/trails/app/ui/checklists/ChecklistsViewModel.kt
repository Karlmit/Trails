package com.trails.app.ui.checklists

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trails.app.data.ChecklistRepository
import com.trails.app.data.ChecklistWithItems
import com.trails.app.sync.SyncScheduler
import com.trails.app.sync.TripRefresher
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import javax.inject.Inject

@HiltViewModel
class ChecklistsViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    repository: ChecklistRepository,
    syncScheduler: SyncScheduler,
) : ViewModel() {
    private val tripId: String = checkNotNull(savedStateHandle["tripId"])
    val checklists: Flow<List<ChecklistWithItems>> = repository.observeForTrip(tripId)

    // This screen previously had no sync trigger of its own -- it only got
    // fresh data as a side effect of the Timeline tab's own sync having run
    // first. A user who opens a trip and stays on Checklists could see
    // arbitrarily stale data relative to another user's edits. Fire a full
    // trip resync on open, same as Timeline's own `init { refresh() }` --
    // now also drives the pull-to-refresh gesture (user-requested).
    private val refresher = TripRefresher(viewModelScope, tripId, syncScheduler)
    val isRefreshing: StateFlow<Boolean> = refresher.isRefreshing
    fun refresh() = refresher.refresh()

    init {
        refresh()
    }
}
