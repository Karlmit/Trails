package com.trails.app.ui.sections

import androidx.annotation.StringRes
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trails.app.R
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
    val emoji: String? = null,
    val color: String? = null,
    val saving: Boolean = false,
    // Dynamic, server-provided error text (e.g. from a thrown exception) --
    // takes precedence over [errorRes] when non-null.
    val error: String? = null,
    // Known, statically-translated error case -- resolved to text by the
    // Composable via stringResource(), since a ViewModel can't call it.
    @StringRes val errorRes: Int? = null,
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
            emoji = existing.emoji,
            color = existing.color,
        )
    }

    fun onNameChange(value: String) { _state.value = _state.value.copy(name = value) }
    fun onStartDateChange(value: String) { _state.value = _state.value.copy(startDate = value) }
    fun onEndDateChange(value: String) { _state.value = _state.value.copy(endDate = value) }
    /** Toggles: tapping the already-selected emoji/color clears it back to the auto-cycled fallback. */
    fun onEmojiToggle(value: String) { _state.value = _state.value.copy(emoji = if (_state.value.emoji == value) null else value) }
    fun onColorToggle(value: String) { _state.value = _state.value.copy(color = if (_state.value.color == value) null else value) }

    fun save() {
        val current = _state.value
        if (current.name.isBlank() || current.startDate.isBlank() || current.endDate.isBlank()) {
            _state.value = current.copy(error = null, errorRes = R.string.section_error_required)
            return
        }
        _state.value = current.copy(saving = true, error = null, errorRes = null)
        viewModelScope.launch {
            val request = SectionRequest(
                tripId = tripId,
                name = current.name.trim(),
                startDate = current.startDate,
                endDate = current.endDate,
                emoji = current.emoji,
                color = current.color,
            )
            runCatching {
                if (current.sectionId == null) timelineRepository.createSection(request)
                else timelineRepository.updateSection(current.sectionId, request)
            }.onSuccess {
                _state.value = _state.value.copy(saving = false, saved = true)
            }.onFailure { e ->
                _state.value = _state.value.copy(
                    saving = false,
                    error = e.message,
                    errorRes = if (e.message == null) R.string.section_error_save_failed else null,
                )
            }
        }
    }

    fun delete() {
        val id = _state.value.sectionId ?: return
        _state.value = _state.value.copy(saving = true, error = null, errorRes = null)
        viewModelScope.launch {
            runCatching { timelineRepository.deleteSection(id) }
                .onSuccess { _state.value = _state.value.copy(saving = false, deleted = true) }
                .onFailure { e ->
                    _state.value = _state.value.copy(
                        saving = false,
                        error = e.message,
                        errorRes = if (e.message == null) R.string.section_error_delete_failed else null,
                    )
                }
        }
    }
}
