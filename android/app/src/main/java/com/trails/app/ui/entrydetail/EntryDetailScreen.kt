package com.trails.app.ui.entrydetail

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
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
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.ui.timeline.graph.ENTRY_TYPE_LABELS
import com.trails.app.ui.timeline.graph.subtypeLabel
import com.trails.app.util.entryMapsUrl
import com.trails.app.util.openCachedFile
import com.trails.app.util.openExternalUrl
import com.trails.app.util.queryDisplayName
import java.io.File

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

    Box(modifier = Modifier.padding(padding).fillMaxSize()) {
        if (entry == null) {
            Text("Loading…", modifier = Modifier.align(Alignment.Center), color = TrailsColors.TextSoft)
            return@Box
        }
        LazyColumn(contentPadding = PaddingValues(20.dp)) {
            item {
                Text(entry.title, style = MaterialTheme.typography.titleLarge, color = TrailsColors.Brand)
                Text(
                    buildString {
                        append(ENTRY_TYPE_LABELS[entry.entryType] ?: entry.entryType)
                        entry.subtype?.let { append(" · ${subtypeLabel(it)}") }
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = TrailsColors.TextSoft,
                    modifier = Modifier.padding(top = 4.dp, bottom = 16.dp),
                )
            }
            item { Field("When", "${entry.startAt}${entry.endAt?.let { " → $it" } ?: ""}") }
            if (entry.locationName != null || entry.locationAddress != null) {
                item {
                    Column(modifier = Modifier.padding(bottom = 12.dp)) {
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
            }
            entry.bookingReference?.let { item { Field("Booking reference", it) } }
            entry.website?.let { website ->
                item {
                    Column(modifier = Modifier.padding(bottom = 12.dp)) {
                        Text("WEBSITE", style = MaterialTheme.typography.labelMedium, color = TrailsColors.TextSoft)
                        Text(
                            website,
                            style = MaterialTheme.typography.bodyLarge,
                            color = TrailsColors.BrandAccent,
                            modifier = Modifier.clickable { openExternalUrl(context, website) },
                        )
                    }
                }
            }
            entry.bookedVia?.let { item { Field("Booked via", it) } }
            if (entry.expenseAmount != null) {
                item {
                    Field(
                        "Expense",
                        "${entry.expenseAmount} ${entry.expenseCurrency ?: ""}" +
                            (entry.expensePaymentStatus?.let { " · $it" } ?: "") +
                            (entry.expensePaymentNote?.let { " · $it" } ?: ""),
                    )
                }
            }
            if (entry.contactName != null || entry.contactPhone != null || entry.contactEmail != null) {
                item { Field("Contact", listOfNotNull(entry.contactName, entry.contactPhone, entry.contactEmail).joinToString(" · ")) }
            }
            state.typeDetails.forEach { (key, value) ->
                if (value.isNotBlank()) item { Field(key, value) }
            }
            entry.notes?.let { item { Field("Notes", it) } }
            entry.postTripNotes?.let { item { Field("Post-trip notes", it) } }

            item {
                Row(modifier = Modifier.fillMaxWidth().padding(top = 16.dp)) {
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
            }

            if (state.photos.isNotEmpty()) {
                item {
                    Text("Photos", style = MaterialTheme.typography.titleMedium, color = TrailsColors.Text, modifier = Modifier.padding(top = 12.dp, bottom = 8.dp))
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
            }

            if (state.attachments.isNotEmpty()) {
                item {
                    Text("Attachments", style = MaterialTheme.typography.titleMedium, color = TrailsColors.Text, modifier = Modifier.padding(top = 16.dp, bottom = 4.dp))
                }
                items(state.attachments) { attachment ->
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

@Composable
private fun Field(label: String, value: String) {
    Column(modifier = Modifier.padding(bottom = 12.dp)) {
        Text(label.uppercase(), style = MaterialTheme.typography.labelMedium, color = TrailsColors.TextSoft)
        Text(value, style = MaterialTheme.typography.bodyLarge, color = TrailsColors.Text)
    }
}
