package com.trails.app.ui.login

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trails.app.auth.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class LoginUiState(
    val username: String = "",
    val password: String = "",
    val isLoading: Boolean = false,
    val error: String? = null,
    val alreadyLoggedIn: Boolean = false,
)

@HiltViewModel
class LoginViewModel @Inject constructor(
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState: StateFlow<LoginUiState> = _uiState

    init {
        viewModelScope.launch {
            if (authRepository.hasStoredToken()) {
                _uiState.value = _uiState.value.copy(alreadyLoggedIn = true)
            }
        }
    }

    fun onUsernameChange(value: String) {
        _uiState.value = _uiState.value.copy(username = value, error = null)
    }

    fun onPasswordChange(value: String) {
        _uiState.value = _uiState.value.copy(password = value, error = null)
    }

    fun login(onSuccess: () -> Unit) {
        val state = _uiState.value
        if (state.username.isBlank() || state.password.isBlank()) {
            _uiState.value = state.copy(error = "Username and password are required")
            return
        }
        _uiState.value = state.copy(isLoading = true, error = null)
        viewModelScope.launch {
            authRepository.login(state.username.trim(), state.password).fold(
                onSuccess = {
                    _uiState.value = _uiState.value.copy(isLoading = false)
                    onSuccess()
                },
                onFailure = { throwable ->
                    _uiState.value = _uiState.value.copy(isLoading = false, error = throwable.message ?: "Login failed")
                },
            )
        }
    }
}
