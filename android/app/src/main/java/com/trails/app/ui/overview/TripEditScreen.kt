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
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
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
                        if (state.tripId == null) "New Trip" else "Edit Trip",
                        color = TrailsColors.Brand,
                        style = MaterialTheme.typography.titleMedium,
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = TrailsColors.Brand)
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
            state.error?.let { ErrorBanner(it) }

            TrailsCard {
                ScreenHeading(
                    emoji = "🧳",
                    title = if (isNew) "New trip" else "Trip details",
                    subtitle = "Where you're going and when -- everything else builds on this.",
                )

                LabeledField(label = "Name", value = state.name, onValueChange = viewModel::onNameChange)
                LabeledField(label = "Destination (optional)", value = state.destination, onValueChange = viewModel::onDestinationChange)
                DatePickerField(label = "Start date", isoDate = state.startDate, onDateChange = viewModel::onStartDateChange)
                DatePickerField(label = "End date", isoDate = state.endDate, onDateChange = viewModel::onEndDateChange)
                LabeledField(label = "Timezone (IANA, e.g. Europe/Stockholm)", value = state.timezone, onValueChange = viewModel::onTimezoneChange)
                MultilineLabeledField(label = "Description (optional)", value = state.description, onValueChange = viewModel::onDescriptionChange)

                if (state.saving) {
                    CircularProgressIndicator(modifier = Modifier.padding(top = 4.dp))
                } else {
                    PillButton(
                        text = if (isNew) "Create trip" else "Save changes",
                        onClick = viewModel::save,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }

            if (!isNew && !state.saving) {
                PillButton(
                    text = "Delete trip",
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
            title = { Text("Delete this Trip?") },
            text = { Text("This deletes the Trip and everything in it. This cannot be undone.") },
            confirmButton = { TextButton(onClick = { showDeleteConfirm = false; viewModel.delete() }) { Text("Delete") } },
            dismissButton = { TextButton(onClick = { showDeleteConfirm = false }) { Text("Cancel") } },
        )
    }
}
