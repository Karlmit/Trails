package com.trails.app.ui.sections

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trails.app.data.TimelineRepository
import com.trails.app.data.entity.SectionEntity
import com.trails.app.network.dto.SectionRequest
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SectionEditState(
    val sectionId: String? = null,
    val name: String = "",
    val startDate: String = "",
    val endDate: String = "",
    val emoji: String = "",
    val saving: Boolean = false,
    val error: String? = null,
    val saved: Boolean = false,
    val deleted: Boolean = false,
)

@HiltViewModel
class SectionEditViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val timelineRepository: TimelineRepository,
) : ViewModel() {
    val tripId: String = checkNotNull(savedStateHandle["tripId"])
    private val sectionId: String? = savedStateHandle.get<String>("sectionId")?.takeUnless { it == "new" }

    private val _state = MutableStateFlow(SectionEditState(sectionId = sectionId))
    val state: StateFlow<SectionEditState> = _state.asStateFlow()

    fun loadIfEditing(sections: List<SectionEntity>) {
        val existing = sections.find { it.id == sectionId } ?: return
        if (_state.value.name.isNotEmpty()) return
        _state.value = _state.value.copy(
            name = existing.name,
            startDate = existing.startDate,
            endDate = existing.endDate,
            emoji = existing.emoji.orEmpty(),
        )
    }

    fun onNameChange(value: String) { _state.value = _state.value.copy(name = value) }
    fun onStartDateChange(value: String) { _state.value = _state.value.copy(startDate = value) }
    fun onEndDateChange(value: String) { _state.value = _state.value.copy(endDate = value) }
    fun onEmojiChange(value: String) { _state.value = _state.value.copy(emoji = value) }

    fun save() {
        val current = _state.value
        if (current.name.isBlank() || current.startDate.isBlank() || current.endDate.isBlank()) {
            _state.value = current.copy(error = "Name, start date, and end date are required.")
            return
        }
        _state.value = current.copy(saving = true, error = null)
        viewModelScope.launch {
            val request = SectionRequest(
                tripId = tripId,
                name = current.name.trim(),
                startDate = current.startDate,
                endDate = current.endDate,
                emoji = current.emoji.trim().takeIf { it.isNotEmpty() },
            )
            runCatching {
                if (current.sectionId == null) timelineRepository.createSection(request)
                else timelineRepository.updateSection(current.sectionId, request)
            }.onSuccess {
                _state.value = _state.value.copy(saving = false, saved = true)
            }.onFailure { e ->
                _state.value = _state.value.copy(saving = false, error = e.message ?: "Failed to save Section.")
            }
        }
    }

    fun delete() {
        val id = _state.value.sectionId ?: return
        _state.value = _state.value.copy(saving = true, error = null)
        viewModelScope.launch {
            runCatching { timelineRepository.deleteSection(id) }
                .onSuccess { _state.value = _state.value.copy(saving = false, deleted = true) }
                .onFailure { e -> _state.value = _state.value.copy(saving = false, error = e.message ?: "Failed to delete Section.") }
        }
    }
}
