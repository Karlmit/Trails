package com.trails.app.ui.settings

import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trails.app.R
import com.trails.app.ui.blog.ProofreadingPreferences
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

const val LANGUAGE_SWEDISH = "sv"
const val LANGUAGE_ENGLISH = "en"

data class SettingsUiState(
    val languageTag: String = LANGUAGE_SWEDISH,
    val useChatGpt: Boolean = false,
    val hasProofreadingKey: Boolean = false,
    val updatingProofreadingKey: Boolean = false,
    val proofreadingKeyMessage: Int? = null,
)

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val proofreading: ProofreadingPreferences,
) : ViewModel() {

    private val _uiState = MutableStateFlow(
        SettingsUiState(
            languageTag = currentLanguageTag(),
            useChatGpt = proofreading.useChatGpt,
            hasProofreadingKey = proofreading.hasApiKey,
        ),
    )
    val uiState: StateFlow<SettingsUiState> = _uiState

    // AppCompat persists the chosen locale across process restarts.
    fun setLanguage(tag: String) {
        AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(tag))
        _uiState.value = _uiState.value.copy(languageTag = tag)
    }

    fun setUseChatGpt(enabled: Boolean) {
        proofreading.useChatGpt = enabled
        _uiState.value = _uiState.value.copy(useChatGpt = enabled, proofreadingKeyMessage = null)
    }

    fun saveProofreadingKey(input: String) {
        val key = input.trim()
        if (!key.startsWith("sk-") || key.length !in 4..512 || key.any { it !in '!'..'~' }) {
            _uiState.value = _uiState.value.copy(proofreadingKeyMessage = R.string.settings_proofread_key_invalid)
            return
        }
        updateKey(R.string.settings_proofread_key_saved) { proofreading.saveApiKey(key) }
    }

    fun removeProofreadingKey() {
        updateKey(R.string.settings_proofread_key_removed, proofreading::removeApiKey)
    }

    private fun updateKey(success: Int, operation: () -> Unit) {
        if (_uiState.value.updatingProofreadingKey) return
        _uiState.value = _uiState.value.copy(updatingProofreadingKey = true, proofreadingKeyMessage = null)
        viewModelScope.launch {
            val (hasKey, message) = withContext(Dispatchers.IO) {
                val message = try {
                    operation()
                    success
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (_: Exception) {
                    R.string.settings_proofread_key_storage_error
                }
                proofreading.hasApiKey to message
            }
            _uiState.value = _uiState.value.copy(
                hasProofreadingKey = hasKey,
                updatingProofreadingKey = false,
                proofreadingKeyMessage = message,
            )
        }
    }

    private fun currentLanguageTag(): String =
        AppCompatDelegate.getApplicationLocales()[0]?.language ?: LANGUAGE_SWEDISH
}
