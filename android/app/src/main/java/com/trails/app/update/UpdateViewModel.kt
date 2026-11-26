package com.trails.app.update

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

enum class UpdateCheckStatus { Idle, Checking, UpToDate, Failed }

data class UpdateUiState(
    val available: UpdateInfo? = null,
    val downloading: Boolean = false,
    val error: Boolean = false,
    val checkStatus: UpdateCheckStatus = UpdateCheckStatus.Idle,
)

@HiltViewModel
class UpdateViewModel @Inject constructor(
    private val updateChecker: UpdateChecker,
) : ViewModel() {

    private val _uiState = MutableStateFlow(UpdateUiState())
    val uiState: StateFlow<UpdateUiState> = _uiState

    init {
        check(manual = false)
    }

    fun checkForUpdates() = check(manual = true)

    private fun check(manual: Boolean) {
        if (_uiState.value.checkStatus == UpdateCheckStatus.Checking || _uiState.value.downloading) return
        _uiState.value = _uiState.value.copy(checkStatus = UpdateCheckStatus.Checking)
        viewModelScope.launch {
            val result = updateChecker.check()
            val current = _uiState.value
            _uiState.value = when (result) {
                is UpdateCheckResult.Available -> current.copy(
                    available = result.info,
                    error = false,
                    checkStatus = UpdateCheckStatus.Idle,
                )
                UpdateCheckResult.UpToDate -> current.copy(
                    available = null,
                    checkStatus = if (manual) UpdateCheckStatus.UpToDate else UpdateCheckStatus.Idle,
                )
                UpdateCheckResult.Failed -> current.copy(
                    checkStatus = if (manual) UpdateCheckStatus.Failed else UpdateCheckStatus.Idle,
                )
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
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                _uiState.value = _uiState.value.copy(downloading = false, error = true)
            }
        }
    }
}
