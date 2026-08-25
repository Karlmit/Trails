package com.trails.app.ui.overview

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.trails.app.R
import com.trails.app.ui.components.CheckboxRow
import com.trails.app.ui.components.DatePickerField
import com.trails.app.ui.components.ErrorBanner
import com.trails.app.ui.components.LabeledField
import com.trails.app.ui.components.MultilineLabeledField
import com.trails.app.ui.components.PillButton
import com.trails.app.ui.components.PillButtonVariant
import com.trails.app.ui.components.ScreenHeading
import com.trails.app.ui.components.TrailsCard
import com.trails.app.ui.theme.TrailsColors

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TripEditScreen(
    onDone: () -> Unit,
    onBack: () -> Unit,
    viewModel: TripEditViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    var showDeleteConfirm by remember { mutableStateOf(false) }

    LaunchedEffect(state.saved, state.deleted) { if (state.saved || state.deleted) onDone() }

    val scrollState = rememberScrollState()
    LaunchedEffect(state.error) { if (state.error != null) scrollState.animateScrollTo(0) }

    Scaffold(
        containerColor = TrailsColors.Canvas,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        if (state.tripId == null) stringResource(R.string.overview_topbar_title_new) else stringResource(R.string.overview_topbar_title_edit),
                        color = TrailsColors.Brand,
                        style = MaterialTheme.typography.titleMedium,
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.overview_back_description), tint = TrailsColors.Brand)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = TrailsColors.Surface),
            )
        },
    ) { padding ->
        val isNew = state.tripId == null
        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .verticalScroll(scrollState)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            val error = state.error ?: state.errorRes?.let { stringResource(it, state.timezone) }
            error?.let { ErrorBanner(it) }

            TrailsCard {
                ScreenHeading(
                    emoji = "🧳",
                    title = if (isNew) stringResource(R.string.overview_edit_title_new) else stringResource(R.string.overview_edit_title_details),
                    subtitle = stringResource(R.string.overview_edit_subtitle),
                )

                LabeledField(label = stringResource(R.string.overview_field_name), value = state.name, onValueChange = viewModel::onNameChange)
                LabeledField(label = stringResource(R.string.overview_field_destination), value = state.destination, onValueChange = viewModel::onDestinationChange)
                DatePickerField(label = stringResource(R.string.overview_field_start_date), isoDate = state.startDate, onDateChange = viewModel::onStartDateChange)
                DatePickerField(label = stringResource(R.string.overview_field_end_date), isoDate = state.endDate, onDateChange = viewModel::onEndDateChange)
                LabeledField(label = stringResource(R.string.overview_field_timezone), value = state.timezone, onValueChange = viewModel::onTimezoneChange)
                MultilineLabeledField(label = stringResource(R.string.overview_field_description), value = state.description, onValueChange = viewModel::onDescriptionChange)
                // User-requested: a manual override so this Trip reads as
                // Active regardless of its dates -- the Android app
                // auto-opens the single Active trip's Timeline on launch.
                CheckboxRow(
                    label = stringResource(R.string.overview_field_pinned_active),
                    checked = state.pinnedActive,
                    onCheckedChange = viewModel::onPinnedActiveChange,
                )

                if (state.saving) {
                    CircularProgressIndicator(modifier = Modifier.padding(top = 4.dp))
                } else {
                    PillButton(
                        text = if (isNew) stringResource(R.string.overview_action_create_trip) else stringResource(R.string.overview_action_save_changes),
                        onClick = viewModel::save,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }

            if (!isNew && !state.saving) {
                PillButton(
                    text = stringResource(R.string.overview_action_delete_trip),
                    variant = PillButtonVariant.Danger,
                    onClick = { showDeleteConfirm = true },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }

    if (showDeleteConfirm) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirm = false },
            title = { Text(stringResource(R.string.overview_delete_trip_dialog_title)) },
            text = { Text(stringResource(R.string.overview_delete_trip_dialog_message)) },
            confirmButton = { TextButton(onClick = { showDeleteConfirm = false; viewModel.delete() }) { Text(stringResource(R.string.overview_dialog_confirm_delete)) } },
            dismissButton = { TextButton(onClick = { showDeleteConfirm = false }) { Text(stringResource(R.string.overview_dialog_cancel)) } },
        )
    }
}
