package com.trails.app.ui.overview

import androidx.annotation.StringRes
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trails.app.R
import com.trails.app.data.TripRepository
import com.trails.app.data.entity.TripEntity
import com.trails.app.network.dto.TripRequest
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.time.ZoneId
import javax.inject.Inject

data class TripEditState(
    val tripId: String? = null,
    val name: String = "",
    val destination: String = "",
    val startDate: String = "",
    val endDate: String = "",
    val timezone: String = ZoneId.systemDefault().id,
    val description: String = "",
    val visibility: String = "PRIVATE",
    // User-requested: a manual override so a Trip reads (and auto-opens on
    // launch) as ACTIVE regardless of its dates.
    val pinnedActive: Boolean = false,
    val saving: Boolean = false,
    // Dynamic, server-provided error text (e.g. from a thrown exception) --
    // takes precedence over [errorRes] when non-null.
    val error: String? = null,
    // Known, statically-translated error case -- resolved to text by the
    // Composable via stringResource(), since a ViewModel can't call it.
    // [overview_error_invalid_timezone] takes a %1$s format arg; the
    // Composable passes [timezone] for it and other errorRes values simply
    // ignore the unused extra argument.
    @StringRes val errorRes: Int? = null,
    val saved: Boolean = false,
    val deleted: Boolean = false,
)

@HiltViewModel
class TripEditViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: TripRepository,
) : ViewModel() {
    private val tripId: String? = savedStateHandle.get<String>("tripId")?.takeUnless { it == "new" }

    private val _state = MutableStateFlow(TripEditState(tripId = tripId))
    val state: StateFlow<TripEditState> = _state.asStateFlow()

    init {
        tripId?.let { id ->
            viewModelScope.launch {
                repository.observeTrip(id).first()?.let { loadFrom(it) }
            }
        }
    }

    private fun loadFrom(existing: TripEntity) {
        if (_state.value.name.isNotEmpty()) return
        _state.value = _state.value.copy(
            name = existing.name,
            destination = existing.destination.orEmpty(),
            startDate = existing.startDate,
            endDate = existing.endDate,
            timezone = existing.timezone,
            description = existing.description.orEmpty(),
            visibility = existing.visibility,
            pinnedActive = existing.pinnedActive,
        )
    }

    fun onNameChange(v: String) { _state.value = _state.value.copy(name = v) }
    fun onDestinationChange(v: String) { _state.value = _state.value.copy(destination = v) }
    fun onStartDateChange(v: String) { _state.value = _state.value.copy(startDate = v) }
    fun onEndDateChange(v: String) { _state.value = _state.value.copy(endDate = v) }
    fun onTimezoneChange(v: String) { _state.value = _state.value.copy(timezone = v) }
    fun onDescriptionChange(v: String) { _state.value = _state.value.copy(description = v) }
    fun onPinnedActiveChange(v: Boolean) { _state.value = _state.value.copy(pinnedActive = v) }

    fun save() {
        val current = _state.value
        if (current.name.isBlank() || current.startDate.isBlank() || current.endDate.isBlank() || current.timezone.isBlank()) {
            _state.value = current.copy(error = null, errorRes = R.string.overview_error_required)
            return
        }
        if (runCatching { ZoneId.of(current.timezone) }.isFailure) {
            _state.value = current.copy(error = null, errorRes = R.string.overview_error_invalid_timezone)
            return
        }
        _state.value = current.copy(saving = true, error = null, errorRes = null)
        viewModelScope.launch {
            val request = TripRequest(
                name = current.name.trim(),
                destination = current.destination.trim().takeIf { it.isNotEmpty() },
                startDate = current.startDate,
                endDate = current.endDate,
                timezone = current.timezone,
                description = current.description.trim().takeIf { it.isNotEmpty() },
                visibility = current.visibility,
                pinnedActive = current.pinnedActive,
            )
            runCatching {
                if (current.tripId == null) repository.createTrip(request) else repository.updateTrip(current.tripId, request)
            }.onSuccess { result ->
                _state.value = _state.value.copy(saving = false, saved = true, tripId = result.id)
            }.onFailure { e ->
                _state.value = _state.value.copy(
                    saving = false,
                    error = e.message,
                    errorRes = if (e.message == null) R.string.overview_error_save_failed else null,
                )
            }
        }
    }

    fun delete() {
        val id = _state.value.tripId ?: return
        _state.value = _state.value.copy(saving = true, error = null, errorRes = null)
        viewModelScope.launch {
            runCatching { repository.deleteTrip(id) }
                .onSuccess { _state.value = _state.value.copy(saving = false, deleted = true) }
                .onFailure { e ->
                    _state.value = _state.value.copy(
                        saving = false,
                        error = e.message,
                        errorRes = if (e.message == null) R.string.overview_error_delete_failed else null,
                    )
                }
        }
    }
}
