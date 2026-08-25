package com.trails.app.ui.entrydetail

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import coil3.compose.AsyncImage
import com.trails.app.ui.components.ScreenHeading
import com.trails.app.ui.components.TrailsCard
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.ui.timeline.graph.ENTRY_TYPE_LABELS
import com.trails.app.ui.timeline.graph.subtypeLabel
import com.trails.app.util.entryMapsUrl
import com.trails.app.util.openCachedFile
import com.trails.app.util.openExternalUrl
import com.trails.app.util.queryDisplayName
import java.io.File

private fun entryTypeEmoji(entryType: String) = when (entryType) {
    "STAY" -> "🏨"
    "TRANSPORT" -> "🚗"
    "ACTIVITY" -> "🎟️"
    else -> "📝"
}

/** Mirrors components/EntryDetailPanel.tsx, plus Photo/Attachment upload (not in the web's read-only panel, but the whole point of an on-device Documents cache). */
@Composable
fun EntryDetailScreen(padding: PaddingValues, viewModel: EntryDetailViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsState()
    val entry = state.entry
    val context = LocalContext.current

    val pickPhoto = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) viewModel.uploadPhoto(uri, queryDisplayName(context, uri))
    }
    val pickAttachment = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) viewModel.uploadAttachment(uri, queryDisplayName(context, uri))
    }
    val isRefreshing by viewModel.isRefreshing.collectAsState()

    com.trails.app.ui.components.PullToRefreshScreen(
        isRefreshing = isRefreshing,
        onRefresh = viewModel::refresh,
        modifier = Modifier.padding(padding).fillMaxSize(),
    ) {
        if (entry == null) {
            Text("Loading…", modifier = Modifier.align(Alignment.Center), color = TrailsColors.TextSoft)
            return@PullToRefreshScreen
        }
        Column(
            modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            TrailsCard {
                ScreenHeading(
                    emoji = entryTypeEmoji(entry.entryType),
                    title = entry.title,
                    subtitle = buildString {
                        append(ENTRY_TYPE_LABELS[entry.entryType] ?: entry.entryType)
                        entry.subtype?.let { append(" · ${subtypeLabel(it)}") }
                    },
                )
                Field("When", "${entry.startAt}${entry.endAt?.let { " → $it" } ?: ""}")
                if (entry.locationName != null || entry.locationAddress != null) {
                    Column {
                        Text("LOCATION", style = MaterialTheme.typography.labelMedium, color = TrailsColors.TextSoft)
                        Text(
                            listOfNotNull(entry.locationName, entry.locationAddress).joinToString(" · "),
                            style = MaterialTheme.typography.bodyLarge,
                            color = TrailsColors.Text,
                        )
                        entryMapsUrl(entry.locationAddress, entry.locationName)?.let { url ->
                            Text(
                                "Open in Google Maps",
                                style = MaterialTheme.typography.bodyMedium,
                                color = TrailsColors.BrandAccent,
                                modifier = Modifier.padding(top = 2.dp).clickable { openExternalUrl(context, url) },
                            )
                        }
                    }
                }
                entry.bookingReference?.let { Field("Booking reference", it) }
                entry.website?.let { website ->
                    Column {
                        Text("WEBSITE", style = MaterialTheme.typography.labelMedium, color = TrailsColors.TextSoft)
                        Text(
                            website,
                            style = MaterialTheme.typography.bodyLarge,
                            color = TrailsColors.BrandAccent,
                            modifier = Modifier.clickable { openExternalUrl(context, website) },
                        )
                    }
                }
                entry.bookedVia?.let { Field("Booked via", it) }
                if (entry.expenseAmount != null) {
                    Field(
                        "Expense",
                        "${entry.expenseAmount} ${entry.expenseCurrency ?: ""}" +
                            (entry.expensePaymentStatus?.let { " · $it" } ?: "") +
                            (entry.expensePaymentNote?.let { " · $it" } ?: ""),
                    )
                }
                if (entry.contactName != null || entry.contactPhone != null || entry.contactEmail != null) {
                    Field("Contact", listOfNotNull(entry.contactName, entry.contactPhone, entry.contactEmail).joinToString(" · "))
                }
                state.typeDetails.forEach { (key, value) ->
                    if (value.isNotBlank()) Field(key, value)
                }
                // User-requested redesign: every leg -- including the
                // first -- is one uniform Flight; a single Flight is
                // today's exact plain behavior, so this only shows once
                // there's a real itinerary to break down. See
                // TransportFlights.kt's own comment.
                if (state.flights.size > 1) {
                    Column {
                        Text("ITINERARY", style = MaterialTheme.typography.labelMedium, color = TrailsColors.TextSoft)
                        state.flights.forEachIndexed { index, flight ->
                            Text(
                                flight.flightNumber.takeIf { it.isNotBlank() }?.let { "✈ $it" } ?: "✈ Flight ${index + 1}",
                                style = MaterialTheme.typography.bodyLarge,
                                color = TrailsColors.Text,
                            )
                            val details = listOfNotNull(
                                flight.terminal.takeIf { it.isNotBlank() }?.let { "Terminal $it" },
                                flight.gate.takeIf { it.isNotBlank() }?.let { "Gate $it" },
                                flight.platform.takeIf { it.isNotBlank() }?.let { "Platform $it" },
                                flight.seat.takeIf { it.isNotBlank() }?.let { "Seat $it" },
                            ).joinToString(" · ")
                            val departure = listOf(flight.departureLocation, formatStopoverDateTime(flight.departureAt)).filter { it.isNotBlank() }.joinToString(" ")
                            val arrival = listOf(flight.arrivalLocation, formatStopoverDateTime(flight.arrivalAt)).filter { it.isNotBlank() }.joinToString(" ")
                            Text(
                                "$departure → $arrival",
                                style = MaterialTheme.typography.bodyMedium,
                                color = TrailsColors.TextSoft,
                            )
                            if (details.isNotEmpty()) {
                                Text(details, style = MaterialTheme.typography.bodyMedium, color = TrailsColors.TextSoft)
                            }
                            if (index < state.flights.lastIndex) {
                                Text(
                                    stopoverGapLabel(flight, state.flights[index + 1]),
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = TrailsColors.TextSoft,
                                )
                            }
                        }
                    }
                }
                entry.notes?.let { Field("Notes", it) }
                entry.postTripNotes?.let { Field("Post-trip notes", it) }
            }

            TrailsCard {
                ScreenHeading(emoji = "📎", title = "Photos & attachments")
                Row(modifier = Modifier.fillMaxWidth()) {
                    Text(
                        "+ Add photo",
                        style = MaterialTheme.typography.bodyMedium,
                        color = TrailsColors.BrandAccent,
                        modifier = Modifier.padding(end = 20.dp).clickable {
                            pickPhoto.launch(androidx.activity.result.PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                        },
                    )
                    Text(
                        "+ Add attachment",
                        style = MaterialTheme.typography.bodyMedium,
                        color = TrailsColors.BrandAccent,
                        modifier = Modifier.clickable { pickAttachment.launch(arrayOf("*/*")) },
                    )
                }

                if (state.photos.isNotEmpty()) {
                    LazyRow {
                        items(state.photos) { photo ->
                            if (photo.localPath != null) {
                                AsyncImage(
                                    model = File(photo.localPath),
                                    contentDescription = null,
                                    contentScale = ContentScale.Crop,
                                    modifier = Modifier.size(96.dp).padding(end = 8.dp).clip(RoundedCornerShape(4.dp)),
                                )
                            }
                        }
                    }
                }

                if (state.attachments.isNotEmpty()) {
                    Column {
                        state.attachments.forEach { attachment ->
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp).clickable {
                                    viewModel.ensureCached(attachment) { path -> openCachedFile(context, path, attachment.mimeType) }
                                },
                            ) {
                                Text(
                                    attachment.originalFilename,
                                    style = MaterialTheme.typography.bodyLarge,
                                    color = TrailsColors.BrandAccent,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Field(label: String, value: String) {
    Column(modifier = Modifier.padding(bottom = 12.dp)) {
        Text(label.uppercase(), style = MaterialTheme.typography.labelMedium, color = TrailsColors.TextSoft)
        Text(value, style = MaterialTheme.typography.bodyLarge, color = TrailsColors.Text)
    }
}
