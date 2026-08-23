package com.trails.app.ui.checklists

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trails.app.data.ChecklistRepository
import com.trails.app.data.ChecklistWithItems
import com.trails.app.sync.SyncScheduler
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ChecklistsViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: ChecklistRepository,
    private val syncScheduler: SyncScheduler,
) : ViewModel() {
    private val tripId: String = checkNotNull(savedStateHandle["tripId"])
    val checklists: Flow<List<ChecklistWithItems>> = repository.observeForTrip(tripId)

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error

    // This screen previously had no sync trigger of its own -- it only got
    // fresh data as a side effect of the Timeline tab's own sync having run
    // first. A user who opens a trip and stays on Checklists could see
    // arbitrarily stale data relative to another user's edits. Fire a full
    // trip resync on open, same as Timeline's own `init { refresh() }`.
    init {
        viewModelScope.launch { syncScheduler.syncTripNow(tripId) }
    }

    /** Online-only: requires connectivity, same as the web app's single-tap toggle. */
    fun setChecked(itemId: String, checked: Boolean) {
        viewModelScope.launch {
            runCatching { repository.setChecked(itemId, checked) }
                .onFailure { _error.value = "Couldn't update -- check your connection and try again." }
        }
    }

    fun dismissError() {
        _error.value = null
    }
}
