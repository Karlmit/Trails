package com.trails.app.ui.entrydetail

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.trails.app.ui.components.CheckboxRow
import com.trails.app.ui.components.DateTimePickerField
import com.trails.app.ui.components.DropdownField
import com.trails.app.ui.components.ErrorBanner
import com.trails.app.ui.components.LabeledField
import com.trails.app.ui.components.LinksEditor
import com.trails.app.ui.components.MultilineLabeledField
import com.trails.app.ui.components.PillButton
import com.trails.app.ui.components.PillButtonVariant
import com.trails.app.ui.components.ScreenHeading
import com.trails.app.ui.components.TrailsCard
import com.trails.app.ui.timeline.graph.ENTRY_TYPE_LABELS
import com.trails.app.ui.timeline.graph.subtypeLabel

private fun entryTypeEmoji(entryType: String) = when (entryType) {
    "STAY" -> "🏨"
    "TRANSPORT" -> "🚗"
    "ACTIVITY" -> "🎟️"
    else -> "📝"
}

@Composable
fun EntryEditScreen(
    padding: PaddingValues,
    onDone: () -> Unit,
    viewModel: EntryEditViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    var showDeleteConfirm by remember { mutableStateOf(false) }

    LaunchedEffect(state.saved, state.deleted) { if (state.saved || state.deleted) onDone() }

    val scrollState = rememberScrollState()
    LaunchedEffect(state.error) { if (state.error != null) scrollState.animateScrollTo(0) }

    val isNote = state.entryType == "NOTE"
    val isActivity = state.entryType == "ACTIVITY"
    val isTransport = state.entryType == "TRANSPORT"
    val isStay = state.entryType == "STAY"

    val isNew = state.entryId == null

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
            emoji = entryTypeEmoji(state.entryType),
            title = if (isNew) "New ${ENTRY_TYPE_LABELS[state.entryType]?.lowercase() ?: "entry"}" else "Edit entry",
        )

        if (state.entryId == null) {
            DropdownField(
                label = "Type",
                options = ENTRY_TYPES,
                selected = state.entryType,
                onSelected = viewModel::onEntryTypeChange,
                optionLabel = { ENTRY_TYPE_LABELS[it] ?: it },
            )
        }
        if (!isNote) {
            DropdownField(
                label = "Subtype",
                options = subtypesFor(state.entryType),
                selected = state.subtype,
                onSelected = viewModel::onSubtypeChange,
                optionLabel = { subtypeLabel(it) },
            )
        }

        if (isNote) {
            LabeledField(label = "Title", value = state.title, onValueChange = viewModel::onTitleChange)
        } else {
            LabeledField(label = "Location name (used as the title)", value = state.locationName, onValueChange = viewModel::onLocationNameChange)
        }
        MultilineLabeledField(label = "Description (optional)", value = state.description, onValueChange = viewModel::onDescriptionChange)

        DateTimePickerField(label = if (isTransport) "Departure" else "Start", isoDateTime = state.startAt, onDateTimeChange = viewModel::onStartAtChange)
        if (!isNote) {
            DateTimePickerField(
                label = if (isTransport) "Arrival" else if (isStay) "Check-out" else "End (optional)",
                isoDateTime = state.endAt.ifBlank { state.startAt },
                onDateTimeChange = viewModel::onEndAtChange,
            )
        }
        if (isTransport) {
            LabeledField(label = "Departure timezone (IANA, optional)", value = state.startTimezone, onValueChange = viewModel::onStartTimezoneChange)
            LabeledField(label = "Arrival timezone (IANA, optional)", value = state.endTimezone, onValueChange = viewModel::onEndTimezoneChange)
        }

        if (!isNote) {
            LabeledField(label = "Location address", value = state.locationAddress, onValueChange = viewModel::onLocationAddressChange)
            LabeledField(label = "Map link", value = state.locationMapLink, onValueChange = viewModel::onLocationMapLinkChange)
            LabeledField(label = "Booking reference", value = state.bookingReference, onValueChange = viewModel::onBookingReferenceChange)
            LabeledField(label = "Website", value = state.website, onValueChange = viewModel::onWebsiteChange)
            LabeledField(label = "Booked via", value = state.bookedVia, onValueChange = viewModel::onBookedViaChange)

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                LabeledField(
                    label = "Expense amount",
                    value = state.expenseAmount,
                    onValueChange = viewModel::onExpenseAmountChange,
                    modifier = Modifier.weight(1f),
                    keyboardType = KeyboardType.Decimal,
                )
                LabeledField(label = "Currency", value = state.expenseCurrency, onValueChange = viewModel::onExpenseCurrencyChange, modifier = Modifier.weight(1f))
            }
            // Preserve any pre-existing value outside the closed Paid/Unpaid
            // set (e.g. an old "Partial") instead of silently discarding it
            // the moment this screen is opened and saved, same as the web form.
            val paymentStatusOptions = if (state.expensePaymentStatus.isNotBlank() && state.expensePaymentStatus !in PAYMENT_STATUSES) {
                PAYMENT_STATUSES + state.expensePaymentStatus
            } else {
                PAYMENT_STATUSES
            }
            DropdownField(
                label = "Payment status",
                options = paymentStatusOptions,
                selected = state.expensePaymentStatus,
                onSelected = viewModel::onExpensePaymentStatusChange,
                optionLabel = { PAYMENT_STATUS_LABELS[it] ?: it },
            )
            LabeledField(label = "Payment note", value = state.expensePaymentNote, onValueChange = viewModel::onExpensePaymentNoteChange)
        }

        if (isStay) {
            LabeledField(label = "Room info", value = state.roomInfo, onValueChange = viewModel::onRoomInfoChange)
        }
        if (isTransport) {
            LabeledField(label = "Terminal", value = state.terminal, onValueChange = viewModel::onTerminalChange)
            LabeledField(label = "Gate", value = state.gate, onValueChange = viewModel::onGateChange)
            LabeledField(label = "Platform", value = state.platform, onValueChange = viewModel::onPlatformChange)
            LabeledField(label = "Service number", value = state.serviceNumber, onValueChange = viewModel::onServiceNumberChange)
            LabeledField(label = "Seat", value = state.seat, onValueChange = viewModel::onSeatChange)
            LabeledField(label = "Baggage info", value = state.baggageInfo, onValueChange = viewModel::onBaggageInfoChange)
        }

        LabeledField(label = "Contact name", value = state.contactName, onValueChange = viewModel::onContactNameChange)
        LabeledField(label = "Contact phone", value = state.contactPhone, onValueChange = viewModel::onContactPhoneChange)
        LabeledField(label = "Contact email", value = state.contactEmail, onValueChange = viewModel::onContactEmailChange)
        MultilineLabeledField(label = "Notes", value = state.notes, onValueChange = viewModel::onNotesChange)
        if (state.entryId != null) {
            MultilineLabeledField(label = "Post-trip notes", value = state.postTripNotes, onValueChange = viewModel::onPostTripNotesChange)
        }
        CheckboxRow(label = "Private -- only visible to you", checked = state.isPrivate, onCheckedChange = viewModel::onIsPrivateChange)
        LinksEditor(links = state.links, onAdd = viewModel::addLink, onRemove = viewModel::removeLink)

        if (state.saving) {
            CircularProgressIndicator(modifier = Modifier.padding(top = 4.dp))
        } else {
            PillButton(
                text = if (isNew) "Create entry" else "Save changes",
                onClick = viewModel::save,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        }

        if (!isNew && !state.saving) {
            PillButton(
                text = "Delete entry",
                variant = PillButtonVariant.Danger,
                onClick = { showDeleteConfirm = true },
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }

    if (showDeleteConfirm) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirm = false },
            title = { Text("Delete this entry?") },
            text = { Text("This cannot be undone.") },
            confirmButton = { TextButton(onClick = { showDeleteConfirm = false; viewModel.delete() }) { Text("Delete") } },
            dismissButton = { TextButton(onClick = { showDeleteConfirm = false }) { Text("Cancel") } },
        )
    }
}
