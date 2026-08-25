package com.trails.app.update

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class UpdateUiState(
    val available: UpdateInfo? = null,
    val downloading: Boolean = false,
    val error: Boolean = false,
)

@HiltViewModel
class UpdateViewModel @Inject constructor(
    private val updateChecker: UpdateChecker,
) : ViewModel() {

    private val _uiState = MutableStateFlow(UpdateUiState())
    val uiState: StateFlow<UpdateUiState> = _uiState

    init {
        // Checked once per app launch (mirrors Boet) -- no periodic polling.
        viewModelScope.launch {
            updateChecker.check()?.let { info ->
                _uiState.value = _uiState.value.copy(available = info)
            }
        }
    }

    fun dismiss() {
        _uiState.value = _uiState.value.copy(available = null)
    }

    fun startUpdate() {
        val info = _uiState.value.available ?: return
        if (!updateChecker.ensureCanInstall()) return
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(downloading = true, error = false)
            try {
                updateChecker.downloadAndInstall(info)
                _uiState.value = _uiState.value.copy(downloading = false)
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(downloading = false, error = true)
            }
        }
    }
}
