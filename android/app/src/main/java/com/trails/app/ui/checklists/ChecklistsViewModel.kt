package com.trails.app.ui.checklists

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trails.app.data.ChecklistRepository
import com.trails.app.data.ChecklistWithItems
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
) : ViewModel() {
    private val tripId: String = checkNotNull(savedStateHandle["tripId"])
    val checklists: Flow<List<ChecklistWithItems>> = repository.observeForTrip(tripId)

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error

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
