package com.trails.app.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.trails.app.R
import com.trails.app.ui.components.PillButton
import com.trails.app.ui.components.PillButtonVariant
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.ui.theme.TrailsShapes

/** Mirrors app/(web)/settings/page.tsx + components/LanguageSettingsForm.tsx. */
@Composable
fun SettingsScreen(
    padding: PaddingValues = PaddingValues(),
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    Column(modifier = Modifier.fillMaxSize().padding(padding).padding(24.dp)) {
        ElevatedCard(
            shape = TrailsShapes.Card,
            colors = CardDefaults.elevatedCardColors(containerColor = TrailsColors.Surface),
            elevation = CardDefaults.elevatedCardElevation(defaultElevation = 2.dp),
        ) {
            Column(modifier = Modifier.padding(24.dp)) {
                Text(
                    stringResource(R.string.settings_language_label),
                    style = MaterialTheme.typography.titleMedium,
                    color = TrailsColors.Brand,
                )
                Text(
                    stringResource(R.string.settings_language_description),
                    style = MaterialTheme.typography.bodyMedium,
                    color = TrailsColors.TextSoft,
                    modifier = Modifier.padding(top = 4.dp, bottom = 16.dp),
                )
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    PillButton(
                        text = stringResource(R.string.settings_language_swedish),
                        onClick = { viewModel.setLanguage(LANGUAGE_SWEDISH) },
                        variant = if (state.languageTag == LANGUAGE_SWEDISH) PillButtonVariant.Primary else PillButtonVariant.Outline,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    PillButton(
                        text = stringResource(R.string.settings_language_english),
                        onClick = { viewModel.setLanguage(LANGUAGE_ENGLISH) },
                        variant = if (state.languageTag == LANGUAGE_ENGLISH) PillButtonVariant.Primary else PillButtonVariant.Outline,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        }
    }
}
