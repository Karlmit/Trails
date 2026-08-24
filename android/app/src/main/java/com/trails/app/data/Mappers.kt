package com.trails.app.data

import com.trails.app.data.entity.AttachmentEntity
import com.trails.app.data.entity.ChecklistEntity
import com.trails.app.data.entity.ChecklistItemEntity
import com.trails.app.data.entity.IdeaEntity
import com.trails.app.data.entity.ImportantInfoEntity
import com.trails.app.data.entity.PhotoEntity
import com.trails.app.data.entity.SectionEntity
import com.trails.app.data.entity.TimelineEntryEntity
import com.trails.app.data.entity.TripEntity
import com.trails.app.network.dto.AttachmentDto
import com.trails.app.network.dto.ChecklistDto
import com.trails.app.network.dto.ChecklistItemDto
import com.trails.app.network.dto.IdeaDto
import com.trails.app.network.dto.ImportantInfoDto
import com.trails.app.network.dto.PhotoDto
import com.trails.app.network.dto.SectionDto
import com.trails.app.network.dto.TimelineEntryDto
import com.trails.app.network.dto.TripDto
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject

fun TripDto.toEntity() = TripEntity(
    id = id,
    name = name,
    destination = destination,
    startDate = startDate,
    endDate = endDate,
    timezone = timezone,
    description = description,
    coverImage = coverImage,
    visibility = visibility,
    pinnedActive = pinnedActive,
    status = status,
    durationDays = durationDays,
    createdAt = createdAt,
    updatedAt = updatedAt,
)

fun SectionDto.toEntity() = SectionEntity(
    id = id,
    tripId = tripId,
    name = name,
    startDate = startDate,
    endDate = endDate,
    color = color,
    emoji = emoji,
    createdAt = createdAt,
    updatedAt = updatedAt,
)

fun TimelineEntryDto.toEntity() = TimelineEntryEntity(
    id = id,
    tripId = tripId,
    entryType = entryType,
    subtype = subtype,
    title = title,
    description = description,
    startAt = startAt,
    endAt = endAt,
    startTimezone = startTimezone,
    endTimezone = endTimezone,
    locationName = locationName,
    locationAddress = locationAddress,
    locationLat = locationLat,
    locationLng = locationLng,
    locationMapLink = locationMapLink,
    bookingReference = bookingReference,
    website = website,
    bookedVia = bookedVia,
    expenseAmount = expenseAmount,
    expenseCurrency = expenseCurrency,
    expensePaymentStatus = expensePaymentStatus,
    expensePaymentNote = expensePaymentNote,
    contactName = contactName,
    contactPhone = contactPhone,
    contactEmail = contactEmail,
    notes = notes,
    postTripNotes = postTripNotes,
    typeDetailsJson = Json.encodeToString(JsonObject.serializer(), typeDetails),
    publishedAt = publishedAt,
    isPrivate = isPrivate,
    createdAt = createdAt,
    updatedAt = updatedAt,
)

fun ChecklistDto.toEntity() = ChecklistEntity(
    id = id,
    tripId = tripId,
    title = title,
    emoji = emoji,
    isPrivate = isPrivate,
    createdAt = createdAt,
    updatedAt = updatedAt,
)

// syncPending always false here -- this is what the server just confirmed,
// so any local pending toggle is by definition resolved once this lands.
fun ChecklistItemDto.toEntity() = ChecklistItemEntity(
    id = id,
    checklistId = checklistId,
    text = text,
    checked = checked,
    note = note,
    createdAt = createdAt,
    updatedAt = updatedAt,
    syncPending = false,
)

fun ImportantInfoDto.toEntity() = ImportantInfoEntity(
    id = id,
    tripId = tripId,
    title = title,
    content = content,
    locationName = locationName,
    locationAddress = locationAddress,
    locationLat = locationLat,
    locationLng = locationLng,
    locationMapLink = locationMapLink,
    contactName = contactName,
    contactPhone = contactPhone,
    contactEmail = contactEmail,
    isPrivate = isPrivate,
    createdAt = createdAt,
    updatedAt = updatedAt,
)

fun IdeaDto.toEntity() = IdeaEntity(
    id = id,
    tripId = tripId,
    sectionId = sectionId,
    title = title,
    category = category,
    priority = priority,
    weatherSuitability = weatherSuitability,
    weatherTagsCsv = weatherTags.joinToString(","),
    locationName = locationName,
    locationAddress = locationAddress,
    locationLat = locationLat,
    locationLng = locationLng,
    locationMapLink = locationMapLink,
    estimatedExpenseAmount = estimatedExpenseAmount,
    estimatedExpenseCurrency = estimatedExpenseCurrency,
    createdAt = createdAt,
    updatedAt = updatedAt,
)

fun AttachmentDto.toEntity(localPath: String? = null) = AttachmentEntity(
    id = id,
    tripId = tripId,
    ownerType = ownerType,
    ownerId = ownerId,
    mimeType = mimeType,
    sizeBytes = sizeBytes,
    originalFilename = originalFilename,
    createdAt = createdAt,
    localPath = localPath,
)

fun PhotoDto.toEntity(localPath: String? = null) = PhotoEntity(
    id = id,
    tripId = tripId,
    ownerType = ownerType,
    ownerId = ownerId,
    mimeType = mimeType,
    sizeBytes = sizeBytes,
    originalFilename = originalFilename,
    isPrimary = isPrimary,
    isPrivate = isPrivate,
    createdAt = createdAt,
    localPath = localPath,
)

val IdeaEntity.weatherTags: List<String>
    get() = if (weatherTagsCsv.isBlank()) emptyList() else weatherTagsCsv.split(",")
