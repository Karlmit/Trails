package com.trails.app.ui.checklists

import androidx.annotation.StringRes
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trails.app.R
import com.trails.app.data.ChecklistRepository
import com.trails.app.data.ChecklistWithItems
import com.trails.app.network.dto.ChecklistRequest
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

// User-requested: editing a Checklist is now just its Title/Emoji/Private
// metadata + Delete -- Items moved to ChecklistDetailScreen ("When I click
// on a checklist, I should only see its items and title"). Description
// was fully removed (not just hidden).
data class ChecklistEditState(
    val checklistId: String? = null,
    val title: String = "",
    val emoji: String = "",
    val isPrivate: Boolean = false,
    val saving: Boolean = false,
    // `error` carries dynamic (network/exception) text; `errorRes` carries
    // one of this ViewModel's own hardcoded messages -- as a @StringRes so
    // ChecklistEditScreen can localize it via stringResource (a Compose API
    // this ViewModel can't call directly). Only one is ever set at a time.
    val error: String? = null,
    @StringRes val errorRes: Int? = null,
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
            emoji = existing.checklist.emoji.orEmpty(),
            isPrivate = existing.checklist.isPrivate,
        )
    }

    fun onTitleChange(value: String) { _state.value = _state.value.copy(title = value) }
    fun onEmojiChange(value: String) { _state.value = _state.value.copy(emoji = value) }
    fun onIsPrivateChange(value: Boolean) { _state.value = _state.value.copy(isPrivate = value) }

    fun save() {
        val current = _state.value
        if (current.title.isBlank()) {
            _state.value = current.copy(error = null, errorRes = R.string.checklist_edit_error_title_required)
            return
        }
        _state.value = current.copy(saving = true, error = null, errorRes = null)
        viewModelScope.launch {
            val request = ChecklistRequest(
                tripId = tripId,
                title = current.title.trim(),
                emoji = current.emoji.trim().takeIf { it.isNotEmpty() },
                isPrivate = current.isPrivate,
            )
            runCatching {
                if (current.checklistId == null) repository.createChecklist(request) else repository.updateChecklist(current.checklistId, request)
            }.onSuccess { result ->
                _state.value = _state.value.copy(saving = false, saved = true, checklistId = result.id)
            }.onFailure { e ->
                _state.value = _state.value.copy(
                    saving = false,
                    error = e.message,
                    errorRes = if (e.message == null) R.string.checklist_edit_error_save_failed else null,
                )
            }
        }
    }

    // User-requested: "Delete checklist only available when in edit mode"
    // -- this ViewModel (and its Delete button) only ever backs the Edit
    // screen now, never the Detail/view screen.
    fun deleteChecklist() {
        val id = _state.value.checklistId ?: return
        _state.value = _state.value.copy(saving = true, error = null, errorRes = null)
        viewModelScope.launch {
            runCatching { repository.deleteChecklist(id) }
                .onSuccess { _state.value = _state.value.copy(saving = false, deleted = true) }
                .onFailure { e ->
                    _state.value = _state.value.copy(
                        saving = false,
                        error = e.message,
                        errorRes = if (e.message == null) R.string.checklist_edit_error_delete_failed else null,
                    )
                }
        }
    }
}
