package com.trails.app.ui.settings

import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat
import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import javax.inject.Inject

const val LANGUAGE_SWEDISH = "sv"
const val LANGUAGE_ENGLISH = "en"

data class SettingsUiState(val languageTag: String = LANGUAGE_SWEDISH)

// Multi-language support: AppCompatDelegate is the single source of truth
// for the chosen locale (auto-persisted across process death by appcompat
// itself, see MainActivity's AppCompatActivity swap) -- no repository/
// DataStore needed here.
@HiltViewModel
class SettingsViewModel @Inject constructor() : ViewModel() {

    private val _uiState = MutableStateFlow(
        SettingsUiState(languageTag = currentLanguageTag()),
    )
    val uiState: StateFlow<SettingsUiState> = _uiState

    fun setLanguage(tag: String) {
        AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(tag))
        _uiState.value = _uiState.value.copy(languageTag = tag)
    }

    private fun currentLanguageTag(): String =
        AppCompatDelegate.getApplicationLocales()[0]?.language ?: LANGUAGE_SWEDISH
}
