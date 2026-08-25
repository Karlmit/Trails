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
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.trails.app.R
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
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.ui.timeline.graph.entryTypeLabelResolved
import com.trails.app.ui.timeline.graph.subtypeLabelResolved

private fun entryTypeEmoji(entryType: String) = when (entryType) {
    "STAY" -> "🏨"
    "TRANSPORT" -> "🚗"
    "ACTIVITY" -> "🎟️"
    else -> "📝"
}

// DateTimePickerField needs a full `Instant.parse`-able string (seconds +
// trailing "Z") -- a Flight created on the *web* app instead stores a
// bare `YYYY-MM-DDTHH:mm` (see TransportFlights.kt's own comment on why
// flight times are never normalized server-side). Silently falls back
// to "now" otherwise, which would then overwrite the real stored value
// the moment this field is saved -- append seconds+Z first so editing a
// web-created Flight here round-trips correctly.
private fun asPickerInstant(value: String): String {
    if (value.isEmpty()) return value
    return runCatching { java.time.Instant.parse(value); value }
        .getOrElse { "${value}:00Z".takeIf { runCatching { java.time.Instant.parse(it) }.isSuccess } ?: value }
}

@Composable
private fun newEntryTitleFor(entryType: String): String = when (entryType) {
    "STAY" -> stringResource(R.string.timeline_new_entry_title_stay)
    "TRANSPORT" -> stringResource(R.string.timeline_new_entry_title_transport)
    "ACTIVITY" -> stringResource(R.string.timeline_new_entry_title_activity)
    "NOTE" -> stringResource(R.string.timeline_new_entry_title_note)
    else -> stringResource(R.string.timeline_new_entry_title_default)
}

@Composable
fun paymentStatusLabelFor(value: String): String = when (value) {
    "Paid" -> stringResource(R.string.timeline_payment_status_paid)
    "Unpaid" -> stringResource(R.string.timeline_payment_status_unpaid)
    "" -> stringResource(R.string.timeline_payment_status_not_set)
    else -> value
}

/** ViewModel-owned errors carry a @StringRes id (plus, for [EntryEditError.EndRequiredFor], the raw entryType to interpolate) instead of a raw String -- see EntryEditViewModel.kt's own doc comment on EntryEditError. */
@Composable
private fun errorMessage(error: EntryEditError): String = when (error) {
    is EntryEditError.Fixed -> stringResource(error.resId)
    is EntryEditError.EndRequiredFor -> stringResource(R.string.timeline_error_end_required, entryTypeLabelResolved(error.entryType))
    is EntryEditError.Raw -> error.text
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
        state.error?.let { ErrorBanner(errorMessage(it)) }

        TrailsCard {
        ScreenHeading(
            emoji = entryTypeEmoji(state.entryType),
            title = if (isNew) newEntryTitleFor(state.entryType) else stringResource(R.string.timeline_edit_entry_title),
        )

        if (state.entryId == null) {
            val entryTypeLabels = ENTRY_TYPES.associateWith { entryTypeLabelResolved(it) }
            DropdownField(
                label = stringResource(R.string.timeline_field_type),
                options = ENTRY_TYPES,
                selected = state.entryType,
                onSelected = viewModel::onEntryTypeChange,
                optionLabel = { entryTypeLabels[it] ?: it },
            )
        }
        if (!isNote) {
            val subtypeOptions = subtypesFor(state.entryType)
            val subtypeLabels = subtypeOptions.associateWith { subtypeLabelResolved(it) }
            DropdownField(
                label = stringResource(R.string.timeline_field_subtype),
                options = subtypeOptions,
                selected = state.subtype,
                onSelected = viewModel::onSubtypeChange,
                optionLabel = { subtypeLabels[it] ?: it },
            )
        }

        if (isNote) {
            LabeledField(label = stringResource(R.string.timeline_field_title), value = state.title, onValueChange = viewModel::onTitleChange)
        } else {
            LabeledField(label = stringResource(R.string.timeline_field_location_name), value = state.locationName, onValueChange = viewModel::onLocationNameChange)
        }
        MultilineLabeledField(label = stringResource(R.string.timeline_field_description), value = state.description, onValueChange = viewModel::onDescriptionChange)

        // Transport no longer shows a top-level Departure/Arrival picker at
        // all -- Flight 1's own departure/arrival (below) becomes the
        // entry's own startAt/endAt (computed in EntryEditViewModel).
        if (!isTransport) {
            DateTimePickerField(label = stringResource(R.string.timeline_field_start), isoDateTime = state.startAt, onDateTimeChange = viewModel::onStartAtChange)
            if (!isNote) {
                DateTimePickerField(
                    label = if (isStay) stringResource(R.string.timeline_check_out) else stringResource(R.string.timeline_field_end_optional),
                    isoDateTime = state.endAt.ifBlank { state.startAt },
                    onDateTimeChange = viewModel::onEndAtChange,
                )
            }
        }

        if (!isNote) {
            LabeledField(label = stringResource(R.string.timeline_field_location_address), value = state.locationAddress, onValueChange = viewModel::onLocationAddressChange)
            LabeledField(label = stringResource(R.string.timeline_field_map_link), value = state.locationMapLink, onValueChange = viewModel::onLocationMapLinkChange)
            LabeledField(label = stringResource(R.string.timeline_field_booking_reference), value = state.bookingReference, onValueChange = viewModel::onBookingReferenceChange)
            LabeledField(label = stringResource(R.string.timeline_field_website), value = state.website, onValueChange = viewModel::onWebsiteChange)
            LabeledField(label = stringResource(R.string.timeline_field_booked_via), value = state.bookedVia, onValueChange = viewModel::onBookedViaChange)

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                LabeledField(
                    label = stringResource(R.string.timeline_field_expense_amount),
                    value = state.expenseAmount,
                    onValueChange = viewModel::onExpenseAmountChange,
                    modifier = Modifier.weight(1f),
                    keyboardType = KeyboardType.Decimal,
                )
                LabeledField(label = stringResource(R.string.timeline_field_currency), value = state.expenseCurrency, onValueChange = viewModel::onExpenseCurrencyChange, modifier = Modifier.weight(1f))
            }
            // Preserve any pre-existing value outside the closed Paid/Unpaid
            // set (e.g. an old "Partial") instead of silently discarding it
            // the moment this screen is opened and saved, same as the web form.
            val paymentStatusOptions = if (state.expensePaymentStatus.isNotBlank() && state.expensePaymentStatus !in PAYMENT_STATUSES) {
                PAYMENT_STATUSES + state.expensePaymentStatus
            } else {
                PAYMENT_STATUSES
            }
            val paymentStatusLabels = paymentStatusOptions.associateWith { paymentStatusLabelFor(it) }
            DropdownField(
                label = stringResource(R.string.timeline_field_payment_status),
                options = paymentStatusOptions,
                selected = state.expensePaymentStatus,
                onSelected = viewModel::onExpensePaymentStatusChange,
                optionLabel = { paymentStatusLabels[it] ?: it },
            )
            LabeledField(label = stringResource(R.string.timeline_field_payment_note), value = state.expensePaymentNote, onValueChange = viewModel::onExpensePaymentNoteChange)
        }

        if (isStay) {
            LabeledField(label = stringResource(R.string.timeline_field_room_info), value = state.roomInfo, onValueChange = viewModel::onRoomInfoChange)
        }
        if (isTransport) {
            // User-requested redesign: every leg -- including the first --
            // is one uniform Flight card, instead of a full-fields first
            // leg plus bare-bones stopovers for the rest. The gap between
            // two Flights is shown as a computed, read-only line rather
            // than separately entered data.
            Text(stringResource(R.string.timeline_field_flights).uppercase(), style = MaterialTheme.typography.labelMedium, color = TrailsColors.TextSoft)
            state.flights.forEachIndexed { index, flight ->
                TrailsCard {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(stringResource(R.string.timeline_flight_number_fallback, index + 1), style = MaterialTheme.typography.bodyMedium, color = TrailsColors.TextSoft)
                        if (index > 0) {
                            TextButton(onClick = { viewModel.removeFlight(index) }) { Text(stringResource(R.string.timeline_remove)) }
                        }
                    }
                    LabeledField(
                        label = stringResource(R.string.timeline_field_departure_location),
                        value = flight.departureLocation,
                        onValueChange = { viewModel.updateFlight(index, flight.copy(departureLocation = it)) },
                    )
                    DateTimePickerField(
                        label = stringResource(R.string.timeline_departure),
                        isoDateTime = asPickerInstant(flight.departureAt),
                        onDateTimeChange = { viewModel.updateFlight(index, flight.copy(departureAt = it)) },
                    )
                    LabeledField(
                        label = stringResource(R.string.timeline_field_departure_timezone),
                        value = flight.departureTimezone,
                        onValueChange = { viewModel.updateFlight(index, flight.copy(departureTimezone = it)) },
                    )
                    LabeledField(
                        label = stringResource(R.string.timeline_field_arrival_location),
                        value = flight.arrivalLocation,
                        onValueChange = { viewModel.updateFlight(index, flight.copy(arrivalLocation = it)) },
                    )
                    DateTimePickerField(
                        label = stringResource(R.string.timeline_arrival),
                        isoDateTime = asPickerInstant(flight.arrivalAt),
                        onDateTimeChange = { viewModel.updateFlight(index, flight.copy(arrivalAt = it)) },
                    )
                    LabeledField(
                        label = stringResource(R.string.timeline_field_arrival_timezone),
                        value = flight.arrivalTimezone,
                        onValueChange = { viewModel.updateFlight(index, flight.copy(arrivalTimezone = it)) },
                    )
                    LabeledField(
                        label = stringResource(R.string.timeline_field_flight_number),
                        value = flight.flightNumber,
                        onValueChange = { viewModel.updateFlight(index, flight.copy(flightNumber = it)) },
                    )
                    LabeledField(
                        label = stringResource(R.string.timeline_field_terminal),
                        value = flight.terminal,
                        onValueChange = { viewModel.updateFlight(index, flight.copy(terminal = it)) },
                    )
                    LabeledField(
                        label = stringResource(R.string.timeline_field_gate),
                        value = flight.gate,
                        onValueChange = { viewModel.updateFlight(index, flight.copy(gate = it)) },
                    )
                    LabeledField(
                        label = stringResource(R.string.timeline_field_platform),
                        value = flight.platform,
                        onValueChange = { viewModel.updateFlight(index, flight.copy(platform = it)) },
                    )
                    LabeledField(
                        label = stringResource(R.string.timeline_field_seat),
                        value = flight.seat,
                        onValueChange = { viewModel.updateFlight(index, flight.copy(seat = it)) },
                    )
                }
                if (index < state.flights.lastIndex) {
                    Text(
                        stopoverGapLabel(
                            flight,
                            state.flights[index + 1],
                            stringResource(R.string.timeline_stopover_at),
                            stringResource(R.string.timeline_stopover),
                        ),
                        style = MaterialTheme.typography.bodyMedium,
                        color = TrailsColors.TextSoft,
                    )
                }
            }
            TextButton(onClick = viewModel::addFlight) { Text(stringResource(R.string.timeline_add_flight)) }

            LabeledField(label = stringResource(R.string.timeline_field_baggage_info), value = state.baggageInfo, onValueChange = viewModel::onBaggageInfoChange)
        }

        LabeledField(label = stringResource(R.string.timeline_field_contact_name), value = state.contactName, onValueChange = viewModel::onContactNameChange)
        LabeledField(label = stringResource(R.string.timeline_field_contact_phone), value = state.contactPhone, onValueChange = viewModel::onContactPhoneChange)
        LabeledField(label = stringResource(R.string.timeline_field_contact_email), value = state.contactEmail, onValueChange = viewModel::onContactEmailChange)
        MultilineLabeledField(label = stringResource(R.string.timeline_field_notes), value = state.notes, onValueChange = viewModel::onNotesChange)
        if (state.entryId != null) {
            MultilineLabeledField(label = stringResource(R.string.timeline_field_post_trip_notes), value = state.postTripNotes, onValueChange = viewModel::onPostTripNotesChange)
        }
        CheckboxRow(label = stringResource(R.string.timeline_field_private), checked = state.isPrivate, onCheckedChange = viewModel::onIsPrivateChange)
        LinksEditor(links = state.links, onAdd = viewModel::addLink, onRemove = viewModel::removeLink)

        if (state.saving) {
            CircularProgressIndicator(modifier = Modifier.padding(top = 4.dp))
        } else {
            PillButton(
                text = if (isNew) stringResource(R.string.timeline_create_entry) else stringResource(R.string.timeline_save_changes),
                onClick = viewModel::save,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        }

        if (!isNew && !state.saving) {
            PillButton(
                text = stringResource(R.string.timeline_delete_entry),
                variant = PillButtonVariant.Danger,
                onClick = { showDeleteConfirm = true },
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }

    if (showDeleteConfirm) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirm = false },
            title = { Text(stringResource(R.string.timeline_delete_entry_confirm_title)) },
            text = { Text(stringResource(R.string.timeline_delete_entry_confirm_body)) },
            confirmButton = { TextButton(onClick = { showDeleteConfirm = false; viewModel.delete() }) { Text(stringResource(R.string.timeline_delete)) } },
            dismissButton = { TextButton(onClick = { showDeleteConfirm = false }) { Text(stringResource(R.string.timeline_cancel)) } },
        )
    }
}
