package com.trails.app.ui.entrydetail

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trails.app.data.LinksTagsRepository
import com.trails.app.data.TimelineRepository
import com.trails.app.data.entity.TimelineEntryEntity
import com.trails.app.network.dto.ActivityEntryRequest
import com.trails.app.network.dto.NoteEntryRequest
import com.trails.app.network.dto.StayEntryRequest
import com.trails.app.network.dto.TimelineEntryWriteRequest
import com.trails.app.network.dto.TransportEntryRequest
import com.trails.app.network.dto.diffFields
import com.trails.app.ui.components.LinkFieldItem
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.encodeToJsonElement
import javax.inject.Inject

private const val OWNER_TYPE = "TIMELINE_ENTRY"

val ENTRY_TYPES = listOf("STAY", "TRANSPORT", "ACTIVITY", "NOTE")

val STAY_SUBTYPES = listOf("HOTEL", "HOSTEL", "RESORT", "APARTMENT", "VILLA", "GUESTHOUSE", "STAY_OTHER")
val TRANSPORT_SUBTYPES = listOf("FLIGHT", "TRAIN", "FERRY", "BUS", "CAR", "TAXI", "TRANSFER", "TRANSPORT_OTHER")
val ACTIVITY_SUBTYPES = listOf(
    "TOUR", "RESTAURANT", "ATTRACTION", "EVENT", "BEACH", "HIKE", "MUSEUM", "SHOPPING", "NIGHTLIFE", "ACTIVITY_OTHER",
)

// expensePaymentStatus stays free text server-side (see WriteRequests.kt) so
// no pre-existing value is ever rejected, but the UI narrows it to a closed
// Paid/Unpaid choice per user request -- they'd already been typing exactly
// "Paid" or "Unpaid" into the old free-text field, so those are the two
// canonical values plus "" for not-set.
val PAYMENT_STATUSES = listOf("", "Paid", "Unpaid")
val PAYMENT_STATUS_LABELS = mapOf("" to "Not set", "Paid" to "Paid", "Unpaid" to "Unpaid")

fun subtypesFor(entryType: String): List<String> = when (entryType) {
    "STAY" -> STAY_SUBTYPES
    "TRANSPORT" -> TRANSPORT_SUBTYPES
    "ACTIVITY" -> ACTIVITY_SUBTYPES
    else -> emptyList()
}

data class EntryEditState(
    val entryId: String? = null,
    val entryType: String = "ACTIVITY",
    val subtype: String = ACTIVITY_SUBTYPES.first(),
    val title: String = "",
    val description: String = "",
    val startAt: String = "",
    val endAt: String = "",
    val startTimezone: String = "",
    val endTimezone: String = "",
    val locationName: String = "",
    val locationAddress: String = "",
    val locationMapLink: String = "",
    val bookingReference: String = "",
    val website: String = "",
    val bookedVia: String = "",
    val expenseAmount: String = "",
    val expenseCurrency: String = "",
    val expensePaymentStatus: String = "",
    val expensePaymentNote: String = "",
    val contactName: String = "",
    val contactPhone: String = "",
    val contactEmail: String = "",
    val notes: String = "",
    val postTripNotes: String = "",
    val isPrivate: Boolean = false,
    // typeDetails, flattened -- only the keys relevant to [entryType] are ever read/sent.
    val roomInfo: String = "",
    val baggageInfo: String = "",
    // User-requested redesign: every leg of a Transport entry -- including
    // the first -- is one uniform Flight (see TransportFlights.kt's own
    // doc comment). Defaults to one blank Flight (rather than an empty
    // list) so a brand-new Transport entry always has a card to fill in,
    // matching the web form's own default.
    val flights: List<FlightDraft> = listOf(FlightDraft()),
    val links: List<LinkFieldItem> = emptyList(),
    val saving: Boolean = false,
    val error: String? = null,
    val saved: Boolean = false,
    val deleted: Boolean = false,
)

@HiltViewModel
class EntryEditViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: TimelineRepository,
    private val linksTagsRepository: LinksTagsRepository,
) : ViewModel() {
    val tripId: String = checkNotNull(savedStateHandle["tripId"])
    private val entryId: String? = savedStateHandle.get<String>("entryId")?.takeUnless { it == "new" }

    private val _state = MutableStateFlow(EntryEditState(entryId = entryId))
    val state: StateFlow<EntryEditState> = _state.asStateFlow()

    // Captured right after `loadFrom` populates the existing Entry's
    // fields -- `save()` diffs against this so a PATCH only ever sends
    // fields the user actually changed on this screen. Null for a create
    // (nothing to diff against) or before loading finishes.
    private var originalFields: Map<String, JsonElement>? = null

    /**
     * Reuses [toRequest]'s already-correct, entryType-specific field
     * shape/transforms (trimming, "" -> null, typeDetails composition) by
     * encoding whichever typed request it built straight to a JsonObject,
     * rather than duplicating that logic here. `tripId`/`entryType` are
     * stripped -- a PATCH doesn't need either (the server always applies
     * the entry's own stored entryType's schema, never a client-supplied
     * one), and stripping them keeps the diffed field set limited to
     * things that can actually differ between [originalFields] and a
     * later edit.
     */
    private fun fieldsOf(current: EntryEditState): Map<String, JsonElement> {
        val body = when (val request = toRequest(current)) {
            is TimelineEntryWriteRequest.Note -> Json.encodeToJsonElement(request.body)
            is TimelineEntryWriteRequest.Stay -> Json.encodeToJsonElement(request.body)
            is TimelineEntryWriteRequest.Transport -> Json.encodeToJsonElement(request.body)
            is TimelineEntryWriteRequest.Activity -> Json.encodeToJsonElement(request.body)
        } as JsonObject
        return body.filterKeys { it != "tripId" && it != "entryType" }
    }

    init {
        entryId?.let { ownerId ->
            viewModelScope.launch {
                runCatching { linksTagsRepository.listLinks(OWNER_TYPE, ownerId) }
                    .onSuccess { links -> _state.value = _state.value.copy(links = links.map { LinkFieldItem(it.id, it.url, it.label) }) }
            }
            viewModelScope.launch {
                val entry = repository.observeEntry(ownerId).first()
                entry?.let { loadFrom(it) }
            }
        }
    }

    private fun loadFrom(existing: TimelineEntryEntity) {
        if (_state.value.title.isNotEmpty() || _state.value.locationName.isNotEmpty()) return
        val typeDetails = parseFlatTypeDetails(existing.typeDetailsJson)
        // An entry saved before the Flights redesign (plain top-level
        // Departure/Arrival + flat terminal/gate/platform/serviceNumber/
        // seat, no `flights` array yet) -- synthesize exactly one Flight
        // from those instead. There's no per-flight location data to
        // recover from that old shape, so both stay blank.
        val flights = parseFlights(existing.typeDetailsJson).ifEmpty {
            if (existing.entryType == "TRANSPORT") {
                listOf(
                    FlightDraft(
                        departureAt = existing.startAt,
                        departureTimezone = existing.startTimezone.orEmpty(),
                        arrivalAt = existing.endAt.orEmpty(),
                        arrivalTimezone = existing.endTimezone.orEmpty(),
                        flightNumber = typeDetails["serviceNumber"].orEmpty(),
                        terminal = typeDetails["terminal"].orEmpty(),
                        gate = typeDetails["gate"].orEmpty(),
                        platform = typeDetails["platform"].orEmpty(),
                        seat = typeDetails["seat"].orEmpty(),
                    ),
                )
            } else {
                emptyList()
            }
        }
        _state.value = _state.value.copy(
            entryType = existing.entryType,
            subtype = existing.subtype ?: subtypesFor(existing.entryType).firstOrNull().orEmpty(),
            title = existing.title,
            description = existing.description.orEmpty(),
            startAt = existing.startAt,
            endAt = existing.endAt.orEmpty(),
            startTimezone = existing.startTimezone.orEmpty(),
            endTimezone = existing.endTimezone.orEmpty(),
            locationName = existing.locationName.orEmpty(),
            locationAddress = existing.locationAddress.orEmpty(),
            locationMapLink = existing.locationMapLink.orEmpty(),
            bookingReference = existing.bookingReference.orEmpty(),
            website = existing.website.orEmpty(),
            bookedVia = existing.bookedVia.orEmpty(),
            expenseAmount = existing.expenseAmount?.toString().orEmpty(),
            expenseCurrency = existing.expenseCurrency.orEmpty(),
            expensePaymentStatus = existing.expensePaymentStatus.orEmpty(),
            expensePaymentNote = existing.expensePaymentNote.orEmpty(),
            contactName = existing.contactName.orEmpty(),
            contactPhone = existing.contactPhone.orEmpty(),
            contactEmail = existing.contactEmail.orEmpty(),
            notes = existing.notes.orEmpty(),
            postTripNotes = existing.postTripNotes.orEmpty(),
            isPrivate = existing.isPrivate,
            roomInfo = typeDetails["roomInfo"].orEmpty(),
            baggageInfo = typeDetails["baggageInfo"].orEmpty(),
            flights = flights,
        )
        originalFields = fieldsOf(_state.value)
    }


    fun onEntryTypeChange(v: String) {
        _state.value = _state.value.copy(entryType = v, subtype = subtypesFor(v).firstOrNull().orEmpty())
    }
    fun onSubtypeChange(v: String) { _state.value = _state.value.copy(subtype = v) }
    fun onTitleChange(v: String) { _state.value = _state.value.copy(title = v) }
    fun onDescriptionChange(v: String) { _state.value = _state.value.copy(description = v) }
    fun onStartAtChange(v: String) { _state.value = _state.value.copy(startAt = v) }
    fun onEndAtChange(v: String) { _state.value = _state.value.copy(endAt = v) }
    fun onStartTimezoneChange(v: String) { _state.value = _state.value.copy(startTimezone = v) }
    fun onEndTimezoneChange(v: String) { _state.value = _state.value.copy(endTimezone = v) }
    fun onLocationNameChange(v: String) { _state.value = _state.value.copy(locationName = v) }
    fun onLocationAddressChange(v: String) { _state.value = _state.value.copy(locationAddress = v) }
    fun onLocationMapLinkChange(v: String) { _state.value = _state.value.copy(locationMapLink = v) }
    fun onBookingReferenceChange(v: String) { _state.value = _state.value.copy(bookingReference = v) }
    fun onWebsiteChange(v: String) { _state.value = _state.value.copy(website = v) }
    fun onBookedViaChange(v: String) { _state.value = _state.value.copy(bookedVia = v) }
    fun onExpenseAmountChange(v: String) { _state.value = _state.value.copy(expenseAmount = v) }
    fun onExpenseCurrencyChange(v: String) { _state.value = _state.value.copy(expenseCurrency = v) }
    fun onExpensePaymentStatusChange(v: String) { _state.value = _state.value.copy(expensePaymentStatus = v) }
    fun onExpensePaymentNoteChange(v: String) { _state.value = _state.value.copy(expensePaymentNote = v) }
    fun onContactNameChange(v: String) { _state.value = _state.value.copy(contactName = v) }
    fun onContactPhoneChange(v: String) { _state.value = _state.value.copy(contactPhone = v) }
    fun onContactEmailChange(v: String) { _state.value = _state.value.copy(contactEmail = v) }
    fun onNotesChange(v: String) { _state.value = _state.value.copy(notes = v) }
    fun onPostTripNotesChange(v: String) { _state.value = _state.value.copy(postTripNotes = v) }
    fun onIsPrivateChange(v: Boolean) { _state.value = _state.value.copy(isPrivate = v) }
    fun onRoomInfoChange(v: String) { _state.value = _state.value.copy(roomInfo = v) }
    fun onBaggageInfoChange(v: String) { _state.value = _state.value.copy(baggageInfo = v) }

    fun addFlight() {
        _state.value = _state.value.copy(flights = _state.value.flights + FlightDraft())
    }
    fun updateFlight(index: Int, patch: FlightDraft) {
        _state.value = _state.value.copy(
            flights = _state.value.flights.mapIndexed { i, f -> if (i == index) patch else f },
        )
    }
    fun removeFlight(index: Int) {
        _state.value = _state.value.copy(flights = _state.value.flights.filterIndexed { i, _ -> i != index })
    }

    fun addLink(url: String, label: String?) {
        val ownerId = _state.value.entryId
        if (ownerId == null) {
            _state.value = _state.value.copy(links = _state.value.links + LinkFieldItem(null, url, label))
            return
        }
        viewModelScope.launch {
            runCatching { linksTagsRepository.createLink(OWNER_TYPE, ownerId, url, label) }
                .onSuccess { created -> _state.value = _state.value.copy(links = _state.value.links + LinkFieldItem(created.id, created.url, created.label)) }
                .onFailure { e -> _state.value = _state.value.copy(error = e.message ?: "Failed to add link.") }
        }
    }

    fun removeLink(link: LinkFieldItem) {
        if (link.id == null) {
            _state.value = _state.value.copy(links = _state.value.links - link)
            return
        }
        viewModelScope.launch {
            runCatching { linksTagsRepository.deleteLink(link.id) }
                .onSuccess { _state.value = _state.value.copy(links = _state.value.links.filterNot { it.id == link.id }) }
                .onFailure { e -> _state.value = _state.value.copy(error = e.message ?: "Failed to remove link.") }
        }
    }

    private fun typeDetailsFor(current: EntryEditState): Map<String, String> = when (current.entryType) {
        "STAY" -> mapOf("roomInfo" to current.roomInfo.trim()).filterValues { it.isNotEmpty() }
        else -> emptyMap()
    }

    // Transport's own startAt/endAt are no longer directly editable --
    // they're computed from the first/last Flight that actually has both
    // of its own times set, matching what the User can see on-screen.
    private fun validFlightsOf(current: EntryEditState): List<FlightDraft> =
        current.flights.filter { it.departureAt.isNotBlank() && it.arrivalAt.isNotBlank() }

    // TRANSPORT only -- see TransportEntryRequest.typeDetails's own
    // comment on why this needs a real JsonObject rather than the flat
    // Map<String, String> [typeDetailsFor] returns for Stay/Activity.
    private fun transportTypeDetailsFor(current: EntryEditState): JsonObject = JsonObject(
        buildMap {
            put("baggageInfo", current.baggageInfo.trim().takeIf { it.isNotEmpty() }?.let { JsonPrimitive(it) } ?: JsonNull)
            put("flights", flightsToJsonArray(validFlightsOf(current)))
        },
    )

    private fun toRequest(current: EntryEditState): TimelineEntryWriteRequest = when (current.entryType) {
        "NOTE" -> TimelineEntryWriteRequest.Note(
            NoteEntryRequest(
                tripId = tripId,
                title = current.title.trim(),
                description = current.description.trim().takeIf { it.isNotEmpty() },
                startAt = current.startAt,
                contactName = current.contactName.trim().takeIf { it.isNotEmpty() },
                contactPhone = current.contactPhone.trim().takeIf { it.isNotEmpty() },
                contactEmail = current.contactEmail.trim().takeIf { it.isNotEmpty() },
                notes = current.notes.trim().takeIf { it.isNotEmpty() },
                postTripNotes = current.postTripNotes.trim().takeIf { it.isNotEmpty() },
                isPrivate = current.isPrivate,
            ),
        )
        "STAY" -> TimelineEntryWriteRequest.Stay(
            StayEntryRequest(
                tripId = tripId,
                subtype = current.subtype,
                title = current.locationName.trim(),
                description = current.description.trim().takeIf { it.isNotEmpty() },
                startAt = current.startAt,
                endAt = current.endAt,
                locationName = current.locationName.trim(),
                locationAddress = current.locationAddress.trim().takeIf { it.isNotEmpty() },
                locationMapLink = current.locationMapLink.trim().takeIf { it.isNotEmpty() },
                bookingReference = current.bookingReference.trim().takeIf { it.isNotEmpty() },
                website = current.website.trim().takeIf { it.isNotEmpty() },
                bookedVia = current.bookedVia.trim().takeIf { it.isNotEmpty() },
                expenseAmount = current.expenseAmount.toDoubleOrNull(),
                expenseCurrency = current.expenseCurrency.trim().takeIf { it.isNotEmpty() },
                expensePaymentStatus = current.expensePaymentStatus.trim().takeIf { it.isNotEmpty() },
                expensePaymentNote = current.expensePaymentNote.trim().takeIf { it.isNotEmpty() },
                contactName = current.contactName.trim().takeIf { it.isNotEmpty() },
                contactPhone = current.contactPhone.trim().takeIf { it.isNotEmpty() },
                contactEmail = current.contactEmail.trim().takeIf { it.isNotEmpty() },
                notes = current.notes.trim().takeIf { it.isNotEmpty() },
                postTripNotes = current.postTripNotes.trim().takeIf { it.isNotEmpty() },
                isPrivate = current.isPrivate,
                typeDetails = typeDetailsFor(current),
            ),
        )
        "TRANSPORT" -> {
            val validFlights = validFlightsOf(current)
            val firstFlight = validFlights.firstOrNull() ?: FlightDraft()
            val lastFlight = validFlights.lastOrNull() ?: firstFlight
            TimelineEntryWriteRequest.Transport(
                TransportEntryRequest(
                    tripId = tripId,
                    subtype = current.subtype,
                    title = current.locationName.trim(),
                    description = current.description.trim().takeIf { it.isNotEmpty() },
                    startAt = firstFlight.departureAt,
                    endAt = lastFlight.arrivalAt,
                    startTimezone = firstFlight.departureTimezone.trim().takeIf { it.isNotEmpty() },
                    endTimezone = lastFlight.arrivalTimezone.trim().takeIf { it.isNotEmpty() },
                    locationName = current.locationName.trim(),
                    locationAddress = current.locationAddress.trim().takeIf { it.isNotEmpty() },
                    locationMapLink = current.locationMapLink.trim().takeIf { it.isNotEmpty() },
                    bookingReference = current.bookingReference.trim().takeIf { it.isNotEmpty() },
                    website = current.website.trim().takeIf { it.isNotEmpty() },
                    bookedVia = current.bookedVia.trim().takeIf { it.isNotEmpty() },
                    expenseAmount = current.expenseAmount.toDoubleOrNull(),
                    expenseCurrency = current.expenseCurrency.trim().takeIf { it.isNotEmpty() },
                    expensePaymentStatus = current.expensePaymentStatus.trim().takeIf { it.isNotEmpty() },
                    expensePaymentNote = current.expensePaymentNote.trim().takeIf { it.isNotEmpty() },
                    contactName = current.contactName.trim().takeIf { it.isNotEmpty() },
                    contactPhone = current.contactPhone.trim().takeIf { it.isNotEmpty() },
                    contactEmail = current.contactEmail.trim().takeIf { it.isNotEmpty() },
                    notes = current.notes.trim().takeIf { it.isNotEmpty() },
                    postTripNotes = current.postTripNotes.trim().takeIf { it.isNotEmpty() },
                    isPrivate = current.isPrivate,
                    typeDetails = transportTypeDetailsFor(current),
                ),
            )
        }
        else -> TimelineEntryWriteRequest.Activity(
            ActivityEntryRequest(
                tripId = tripId,
                subtype = current.subtype,
                title = current.locationName.trim(),
                description = current.description.trim().takeIf { it.isNotEmpty() },
                startAt = current.startAt,
                endAt = current.endAt.takeIf { it.isNotBlank() },
                locationName = current.locationName.trim(),
                locationAddress = current.locationAddress.trim().takeIf { it.isNotEmpty() },
                locationMapLink = current.locationMapLink.trim().takeIf { it.isNotEmpty() },
                bookingReference = current.bookingReference.trim().takeIf { it.isNotEmpty() },
                website = current.website.trim().takeIf { it.isNotEmpty() },
                bookedVia = current.bookedVia.trim().takeIf { it.isNotEmpty() },
                expenseAmount = current.expenseAmount.toDoubleOrNull(),
                expenseCurrency = current.expenseCurrency.trim().takeIf { it.isNotEmpty() },
                expensePaymentStatus = current.expensePaymentStatus.trim().takeIf { it.isNotEmpty() },
                expensePaymentNote = current.expensePaymentNote.trim().takeIf { it.isNotEmpty() },
                contactName = current.contactName.trim().takeIf { it.isNotEmpty() },
                contactPhone = current.contactPhone.trim().takeIf { it.isNotEmpty() },
                contactEmail = current.contactEmail.trim().takeIf { it.isNotEmpty() },
                notes = current.notes.trim().takeIf { it.isNotEmpty() },
                postTripNotes = current.postTripNotes.trim().takeIf { it.isNotEmpty() },
                isPrivate = current.isPrivate,
                typeDetails = typeDetailsFor(current),
            ),
        )
    }

    fun save() {
        val current = _state.value
        val effectiveTitle = if (current.entryType == "NOTE") current.title else current.locationName
        if (effectiveTitle.isBlank()) {
            _state.value = current.copy(error = "Title/location is required.")
            return
        }
        // Transport's own startAt/endAt are no longer directly editable --
        // at least one Flight needs both of its own times set instead.
        if (current.entryType == "TRANSPORT") {
            if (validFlightsOf(current).isEmpty()) {
                _state.value = current.copy(error = "At least one Flight needs both a departure and arrival date/time.")
                return
            }
        } else if (current.startAt.isBlank()) {
            _state.value = current.copy(error = "A start date & time is required.")
            return
        } else if (current.entryType != "NOTE" && current.entryType != "ACTIVITY" && current.endAt.isBlank()) {
            _state.value = current.copy(error = "An end date & time is required for ${current.entryType}.")
            return
        }
        if (current.entryType != "NOTE" && current.expenseAmount.isNotBlank() != current.expenseCurrency.isNotBlank()) {
            _state.value = current.copy(error = "Expense requires both an amount and a currency, or neither.")
            return
        }
        _state.value = current.copy(saving = true, error = null)
        viewModelScope.launch {
            runCatching {
                if (current.entryId == null) {
                    repository.createTimelineEntry(toRequest(current))
                } else {
                    repository.updateTimelineEntry(current.entryId, diffFields(originalFields, fieldsOf(current)))
                }
            }.onSuccess { result ->
                current.links.filter { it.id == null }.forEach { link ->
                    runCatching { linksTagsRepository.createLink(OWNER_TYPE, result.id, link.url, link.label) }
                }
                _state.value = _state.value.copy(saving = false, saved = true, entryId = result.id)
            }.onFailure { e ->
                _state.value = _state.value.copy(saving = false, error = e.message ?: "Failed to save entry.")
            }
        }
    }

    fun delete() {
        val id = _state.value.entryId ?: return
        _state.value = _state.value.copy(saving = true, error = null)
        viewModelScope.launch {
            runCatching { repository.deleteTimelineEntry(id) }
                .onSuccess { _state.value = _state.value.copy(saving = false, deleted = true) }
                .onFailure { e -> _state.value = _state.value.copy(saving = false, error = e.message ?: "Failed to delete entry.") }
        }
    }
}
