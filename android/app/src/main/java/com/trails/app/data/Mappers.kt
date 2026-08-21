package com.trails.app.data

import com.trails.app.data.entity.SectionEntity
import com.trails.app.data.entity.TimelineEntryEntity
import com.trails.app.data.entity.TripEntity
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
