package com.trails.app.ui.login

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trails.app.R
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
    // Dynamic, server-provided error text (e.g. from a thrown exception) --
    // takes precedence over [errorRes] when non-null.
    val error: String? = null,
    // Known, statically-translated error case -- resolved to text by the
    // Composable via stringResource(), since a ViewModel can't call it.
    @StringRes val errorRes: Int? = null,
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
        _uiState.value = _uiState.value.copy(username = value, error = null, errorRes = null)
    }

    fun onPasswordChange(value: String) {
        _uiState.value = _uiState.value.copy(password = value, error = null, errorRes = null)
    }

    fun login(onSuccess: () -> Unit) {
        val state = _uiState.value
        if (state.username.isBlank() || state.password.isBlank()) {
            _uiState.value = state.copy(error = null, errorRes = R.string.shell_login_missing_credentials)
            return
        }
        _uiState.value = state.copy(isLoading = true, error = null, errorRes = null)
        viewModelScope.launch {
            authRepository.login(state.username.trim(), state.password).fold(
                onSuccess = {
                    _uiState.value = _uiState.value.copy(isLoading = false)
                    onSuccess()
                },
                onFailure = { throwable ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = throwable.message,
                        errorRes = if (throwable.message == null) R.string.shell_login_failed else null,
                    )
                },
            )
        }
    }
}
