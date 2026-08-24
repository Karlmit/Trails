package com.trails.app.ui.checklists

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trails.app.data.ChecklistRepository
import com.trails.app.data.ChecklistWithItems
import com.trails.app.network.dto.ChecklistItemRequest
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * User-requested: "When I click on a checklist, I should only see its
 * items and title." This is that screen -- title (read-only here; editing
 * it is ChecklistEditScreen's job, reached via this screen's own Edit
 * button) plus the Item list, with the same single-tap checkbox toggle and
 * add/remove item actions that used to live on the edit screen.
 */
@HiltViewModel
class ChecklistDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: ChecklistRepository,
) : ViewModel() {
    val tripId: String = checkNotNull(savedStateHandle["tripId"])
    val checklistId: String = checkNotNull(savedStateHandle["checklistId"])

    val checklist: StateFlow<ChecklistWithItems?> = repository.observeForTrip(tripId)
        .map { list -> list.find { it.checklist.id == checklistId } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    private val _newItemText = MutableStateFlow("")
    val newItemText: StateFlow<String> = _newItemText

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error

    fun onNewItemTextChange(value: String) {
        _newItemText.value = value
    }

    fun addItem() {
        val text = _newItemText.value.trim()
        if (text.isEmpty()) return
        viewModelScope.launch {
            runCatching { repository.createChecklistItem(ChecklistItemRequest(checklistId = checklistId, text = text)) }
                .onSuccess { _newItemText.value = "" }
                .onFailure { e -> _error.value = e.message ?: "Failed to add item." }
        }
    }

    fun deleteItem(itemId: String) {
        viewModelScope.launch {
            runCatching { repository.deleteChecklistItem(itemId) }
                .onFailure { e -> _error.value = e.message ?: "Failed to delete item." }
        }
    }

    // Never throws -- see ChecklistRepository.setChecked's own comment:
    // an offline toggle now saves locally and syncs once back online,
    // it's not a failure to surface.
    fun setChecked(itemId: String, checked: Boolean) {
        viewModelScope.launch { repository.setChecked(itemId, checked) }
    }

    fun dismissError() {
        _error.value = null
    }
}
