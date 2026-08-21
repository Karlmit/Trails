package com.trails.app.ui.entrydetail

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trails.app.data.LinksTagsRepository
import com.trails.app.data.TimelineRepository
import com.trails.app.data.entity.TimelineEntryEntity
import com.trails.app.network.dto.TimelineEntryRequest
import com.trails.app.ui.components.LinkFieldItem
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import javax.inject.Inject

private const val OWNER_TYPE = "TIMELINE_ENTRY"

val ENTRY_TYPES = listOf("STAY", "TRANSPORT", "ACTIVITY", "NOTE")

val STAY_SUBTYPES = listOf("HOTEL", "HOSTEL", "RESORT", "APARTMENT", "VILLA", "GUESTHOUSE", "STAY_OTHER")
val TRANSPORT_SUBTYPES = listOf("FLIGHT", "TRAIN", "FERRY", "BUS", "CAR", "TAXI", "TRANSFER", "TRANSPORT_OTHER")
val ACTIVITY_SUBTYPES = listOf(
    "TOUR", "RESTAURANT", "ATTRACTION", "EVENT", "BEACH", "HIKE", "MUSEUM", "SHOPPING", "NIGHTLIFE", "ACTIVITY_OTHER",
)

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
    val terminal: String = "",
    val gate: String = "",
    val platform: String = "",
    val serviceNumber: String = "",
    val seat: String = "",
    val baggageInfo: String = "",
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
        val typeDetails = parseTypeDetails(existing.typeDetailsJson)
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
            terminal = typeDetails["terminal"].orEmpty(),
            gate = typeDetails["gate"].orEmpty(),
            platform = typeDetails["platform"].orEmpty(),
            serviceNumber = typeDetails["serviceNumber"].orEmpty(),
            seat = typeDetails["seat"].orEmpty(),
            baggageInfo = typeDetails["baggageInfo"].orEmpty(),
        )
    }

    private fun parseTypeDetails(json: String?): Map<String, String> {
        if (json.isNullOrBlank()) return emptyMap()
        return runCatching {
            (Json.parseToJsonElement(json) as JsonObject).entries.associate { (k, v) -> k to v.jsonPrimitive.content }
        }.getOrDefault(emptyMap())
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
    fun onTerminalChange(v: String) { _state.value = _state.value.copy(terminal = v) }
    fun onGateChange(v: String) { _state.value = _state.value.copy(gate = v) }
    fun onPlatformChange(v: String) { _state.value = _state.value.copy(platform = v) }
    fun onServiceNumberChange(v: String) { _state.value = _state.value.copy(serviceNumber = v) }
    fun onSeatChange(v: String) { _state.value = _state.value.copy(seat = v) }
    fun onBaggageInfoChange(v: String) { _state.value = _state.value.copy(baggageInfo = v) }

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
        "TRANSPORT" -> mapOf(
            "terminal" to current.terminal.trim(),
            "gate" to current.gate.trim(),
            "platform" to current.platform.trim(),
            "serviceNumber" to current.serviceNumber.trim(),
            "seat" to current.seat.trim(),
            "baggageInfo" to current.baggageInfo.trim(),
        ).filterValues { it.isNotEmpty() }
        else -> emptyMap()
    }

    private fun toRequest(current: EntryEditState) = TimelineEntryRequest(
        tripId = tripId,
        entryType = current.entryType,
        subtype = current.subtype.takeIf { current.entryType != "NOTE" && it.isNotBlank() },
        title = if (current.entryType == "NOTE") current.title.trim() else current.locationName.trim(),
        description = current.description.trim().takeIf { it.isNotEmpty() },
        startAt = current.startAt,
        endAt = current.endAt.takeIf { current.entryType != "NOTE" && it.isNotBlank() },
        startTimezone = current.startTimezone.takeIf { current.entryType == "TRANSPORT" && it.isNotBlank() },
        endTimezone = current.endTimezone.takeIf { current.entryType == "TRANSPORT" && it.isNotBlank() },
        locationName = current.locationName.trim().takeIf { current.entryType != "NOTE" && it.isNotEmpty() },
        locationAddress = current.locationAddress.trim().takeIf { current.entryType != "NOTE" && it.isNotEmpty() },
        locationMapLink = current.locationMapLink.trim().takeIf { current.entryType != "NOTE" && it.isNotEmpty() },
        bookingReference = current.bookingReference.trim().takeIf { current.entryType != "NOTE" && it.isNotEmpty() },
        website = current.website.trim().takeIf { current.entryType != "NOTE" && it.isNotEmpty() },
        bookedVia = current.bookedVia.trim().takeIf { current.entryType != "NOTE" && it.isNotEmpty() },
        expenseAmount = current.expenseAmount.toDoubleOrNull().takeIf { current.entryType != "NOTE" },
        expenseCurrency = current.expenseCurrency.trim().takeIf { current.entryType != "NOTE" && it.isNotEmpty() },
        expensePaymentStatus = current.expensePaymentStatus.trim().takeIf { current.entryType != "NOTE" && it.isNotEmpty() },
        expensePaymentNote = current.expensePaymentNote.trim().takeIf { current.entryType != "NOTE" && it.isNotEmpty() },
        contactName = current.contactName.trim().takeIf { it.isNotEmpty() },
        contactPhone = current.contactPhone.trim().takeIf { it.isNotEmpty() },
        contactEmail = current.contactEmail.trim().takeIf { it.isNotEmpty() },
        notes = current.notes.trim().takeIf { it.isNotEmpty() },
        postTripNotes = current.postTripNotes.trim().takeIf { it.isNotEmpty() },
        typeDetails = typeDetailsFor(current),
        isPrivate = current.isPrivate,
    )

    fun save() {
        val current = _state.value
        val effectiveTitle = if (current.entryType == "NOTE") current.title else current.locationName
        if (effectiveTitle.isBlank() || current.startAt.isBlank()) {
            _state.value = current.copy(error = "Title/location and start date & time are required.")
            return
        }
        if (current.entryType != "NOTE" && current.entryType != "ACTIVITY" && current.endAt.isBlank()) {
            _state.value = current.copy(error = "An end date & time is required for ${current.entryType}.")
            return
        }
        _state.value = current.copy(saving = true, error = null)
        viewModelScope.launch {
            runCatching {
                if (current.entryId == null) repository.createTimelineEntry(toRequest(current))
                else repository.updateTimelineEntry(current.entryId, toRequest(current))
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
