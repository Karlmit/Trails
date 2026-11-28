package com.trails.app.ui.settings

import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModelStoreOwner
import com.trails.app.R
import com.trails.app.ui.components.PillButton
import com.trails.app.ui.components.PillButtonVariant
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.ui.components.TrailsCard
import com.trails.app.ui.components.TrailsCardVariant
import com.trails.app.update.UpdateCheckStatus
import com.trails.app.update.UpdateViewModel

/** Mirrors app/(web)/settings/page.tsx + components/LanguageSettingsForm.tsx. */
@Composable
fun SettingsScreen(
    padding: PaddingValues = PaddingValues(),
    viewModel: SettingsViewModel = hiltViewModel(),
    updateViewModel: UpdateViewModel = hiltViewModel(
        viewModelStoreOwner = LocalActivity.current as ViewModelStoreOwner,
    ),
) {
    val state by viewModel.uiState.collectAsState()
    val updateState by updateViewModel.uiState.collectAsState()
    val checking = updateState.checkStatus == UpdateCheckStatus.Checking

    Column(
        modifier = Modifier.fillMaxSize().padding(padding)
            .verticalScroll(rememberScrollState()).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        TrailsCard(
            variant = TrailsCardVariant.Standard,
            contentPadding = PaddingValues(0.dp),
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
        ProofreadingSettings(
            state = state,
            onProviderChange = viewModel::setUseChatGpt,
            onSaveKey = viewModel::saveProofreadingKey,
            onRemoveKey = viewModel::removeProofreadingKey,
        )
        TrailsCard(
            variant = TrailsCardVariant.Standard,
            contentPadding = PaddingValues(24.dp),
        ) {
            Text(
                stringResource(R.string.settings_updates_label),
                style = MaterialTheme.typography.titleMedium,
                color = TrailsColors.Brand,
            )
            PillButton(
                text = stringResource(
                    if (checking) R.string.settings_updates_checking else R.string.settings_updates_check,
                ),
                onClick = updateViewModel::checkForUpdates,
                enabled = !checking && !updateState.downloading,
                variant = PillButtonVariant.Outline,
                modifier = Modifier.fillMaxWidth(),
            )
            val feedback = when (updateState.checkStatus) {
                UpdateCheckStatus.UpToDate -> R.string.settings_updates_current
                UpdateCheckStatus.Failed -> R.string.settings_updates_failed
                else -> null
            }
            feedback?.let {
                Text(
                    stringResource(it),
                    style = MaterialTheme.typography.bodyMedium,
                    color = TrailsColors.TextSoft,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                )
            }
        }
    }
}

@Composable
private fun ProofreadingSettings(
    state: SettingsUiState,
    onProviderChange: (Boolean) -> Unit,
    onSaveKey: (String) -> Unit,
    onRemoveKey: () -> Unit,
) {
    var draftKey by remember(state.useChatGpt) { mutableStateOf("") }
    LaunchedEffect(state.proofreadingKeyMessage) {
        if (state.proofreadingKeyMessage == R.string.settings_proofread_key_saved) draftKey = ""
    }
    TrailsCard(
        variant = TrailsCardVariant.Standard,
        contentPadding = PaddingValues(24.dp),
    ) {
        Text(
            stringResource(R.string.blog_proofread_title),
            style = MaterialTheme.typography.titleMedium,
            color = TrailsColors.Brand,
        )
        Row(
            modifier = Modifier.fillMaxWidth().toggleable(
                value = state.useChatGpt,
                role = Role.Switch,
                onValueChange = onProviderChange,
            ),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                stringResource(R.string.settings_proofread_use_chatgpt),
                modifier = Modifier.weight(1f),
            )
            Switch(checked = state.useChatGpt, onCheckedChange = null)
        }
        Text(
            stringResource(
                if (state.useChatGpt) R.string.settings_proofread_cloud_description
                else R.string.settings_proofread_local_description,
            ),
            style = MaterialTheme.typography.bodyMedium,
            color = TrailsColors.TextSoft,
        )
        if (state.useChatGpt || state.hasProofreadingKey) {
            OutlinedTextField(
                value = draftKey,
                onValueChange = { draftKey = it },
                label = { Text(stringResource(R.string.settings_proofread_key)) },
                supportingText = if (state.hasProofreadingKey) {
                    { Text(stringResource(R.string.settings_proofread_key_configured)) }
                } else null,
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, autoCorrectEnabled = false),
                enabled = !state.updatingProofreadingKey,
                modifier = Modifier.fillMaxWidth(),
            )
            PillButton(
                text = stringResource(R.string.settings_proofread_key_save),
                onClick = { onSaveKey(draftKey) },
                enabled = draftKey.isNotBlank() && !state.updatingProofreadingKey,
                variant = PillButtonVariant.Outline,
                modifier = Modifier.fillMaxWidth(),
            )
            if (state.hasProofreadingKey) {
                PillButton(
                    text = stringResource(R.string.settings_proofread_key_remove),
                    onClick = onRemoveKey,
                    enabled = !state.updatingProofreadingKey,
                    variant = PillButtonVariant.Outline,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
        state.proofreadingKeyMessage?.let {
            Text(
                stringResource(it),
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
            )
        }
    }
}
