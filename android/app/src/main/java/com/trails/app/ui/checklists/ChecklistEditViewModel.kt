package com.trails.app.ui.checklists

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trails.app.data.ChecklistRepository
import com.trails.app.data.ChecklistWithItems
import com.trails.app.network.dto.ChecklistItemRequest
import com.trails.app.network.dto.ChecklistRequest
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ChecklistEditState(
    val checklistId: String? = null,
    val title: String = "",
    val description: String = "",
    val isPrivate: Boolean = false,
    val newItemText: String = "",
    val saving: Boolean = false,
    val error: String? = null,
    val saved: Boolean = false,
    val deleted: Boolean = false,
)

@HiltViewModel
class ChecklistEditViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: ChecklistRepository,
) : ViewModel() {
    val tripId: String = checkNotNull(savedStateHandle["tripId"])
    val checklistId: String? = savedStateHandle.get<String>("checklistId")?.takeUnless { it == "new" }

    private val _state = MutableStateFlow(ChecklistEditState(checklistId = checklistId))
    val state: StateFlow<ChecklistEditState> = _state.asStateFlow()

    fun loadIfEditing(all: List<ChecklistWithItems>) {
        val existing = all.find { it.checklist.id == checklistId } ?: return
        if (_state.value.title.isNotEmpty()) return
        _state.value = _state.value.copy(
            title = existing.checklist.title,
            description = existing.checklist.description.orEmpty(),
            isPrivate = existing.checklist.isPrivate,
        )
    }

    fun onTitleChange(value: String) { _state.value = _state.value.copy(title = value) }
    fun onDescriptionChange(value: String) { _state.value = _state.value.copy(description = value) }
    fun onIsPrivateChange(value: Boolean) { _state.value = _state.value.copy(isPrivate = value) }
    fun onNewItemTextChange(value: String) { _state.value = _state.value.copy(newItemText = value) }

    fun save() {
        val current = _state.value
        if (current.title.isBlank()) {
            _state.value = current.copy(error = "Title is required.")
            return
        }
        _state.value = current.copy(saving = true, error = null)
        viewModelScope.launch {
            val request = ChecklistRequest(
                tripId = tripId,
                title = current.title.trim(),
                description = current.description.trim().takeIf { it.isNotEmpty() },
                isPrivate = current.isPrivate,
            )
            runCatching {
                if (current.checklistId == null) repository.createChecklist(request) else repository.updateChecklist(current.checklistId, request)
            }.onSuccess { result ->
                _state.value = _state.value.copy(saving = false, saved = true, checklistId = result.id)
            }.onFailure { e ->
                _state.value = _state.value.copy(saving = false, error = e.message ?: "Failed to save Checklist.")
            }
        }
    }

    fun deleteChecklist() {
        val id = _state.value.checklistId ?: return
        _state.value = _state.value.copy(saving = true, error = null)
        viewModelScope.launch {
            runCatching { repository.deleteChecklist(id) }
                .onSuccess { _state.value = _state.value.copy(saving = false, deleted = true) }
                .onFailure { e -> _state.value = _state.value.copy(saving = false, error = e.message ?: "Failed to delete Checklist.") }
        }
    }

    fun addItem() {
        val id = _state.value.checklistId ?: return
        val text = _state.value.newItemText.trim()
        if (text.isEmpty()) return
        viewModelScope.launch {
            runCatching { repository.createChecklistItem(ChecklistItemRequest(checklistId = id, text = text)) }
                .onSuccess { _state.value = _state.value.copy(newItemText = "") }
                .onFailure { e -> _state.value = _state.value.copy(error = e.message ?: "Failed to add item.") }
        }
    }

    fun deleteItem(itemId: String) {
        viewModelScope.launch {
            runCatching { repository.deleteChecklistItem(itemId) }
                .onFailure { e -> _state.value = _state.value.copy(error = e.message ?: "Failed to delete item.") }
        }
    }

    fun setChecked(itemId: String, checked: Boolean) {
        viewModelScope.launch {
            runCatching { repository.setChecked(itemId, checked) }
                .onFailure { e -> _state.value = _state.value.copy(error = e.message ?: "Failed to update item.") }
        }
    }
}
