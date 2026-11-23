package com.trails.app.ui.importantinfo

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import coil3.compose.AsyncImage
import com.trails.app.R
import com.trails.app.data.isUsablePhotoCache
import com.trails.app.ui.components.*
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.util.openExternalUrl
import java.io.File

@Composable
fun ImportantInfoDetailScreen(
    padding: PaddingValues,
    onOpenAttachment: (String) -> Unit,
    onOpenPhoto: (String) -> Unit,
    onMissing: () -> Unit,
    viewModel: ImportantInfoDetailViewModel = hiltViewModel(),
) {
    val itemState by viewModel.itemState.collectAsState()
    val item = itemState.item
    val loaded = itemState.loaded
    LaunchedEffect(loaded, item) { if (loaded && item == null) onMissing() }
    val links by viewModel.links.collectAsState()
    val tags by viewModel.tags.collectAsState()
    val photos by viewModel.photos.collectAsState()
    val attachments by viewModel.attachments.collectAsState()
    val error by viewModel.error.collectAsState()
    val errorRes by viewModel.errorRes.collectAsState()
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner, viewModel) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) viewModel.refreshExtras()
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
    Column(
        modifier = Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        val current = item
        if (current == null) {
            Text(stringResource(R.string.info_detail_unavailable), color = TrailsColors.TextSoft)
            return@Column
        }
        (error ?: errorRes?.let { stringResource(it) })?.let {
            ErrorBanner(it)
            TextButton(onClick = viewModel::refreshExtras) { Text(stringResource(R.string.idea_sync_retry)) }
        }
        TrailsCard {
            ScreenHeading(emoji = current.emoji?.takeIf { it.isNotBlank() } ?: "📌", title = current.title)
            if (current.isPrivate) Text(stringResource(R.string.info_field_private), color = TrailsColors.TextSoft)
            current.content?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodyLarge) }
        }
        if (listOf(current.locationName, current.locationAddress, current.locationMapLink).any { !it.isNullOrBlank() } || (current.locationLat != null && current.locationLng != null)) {
            TrailsCard {
                ScreenHeading(emoji = "📍", title = stringResource(R.string.info_detail_location))
                current.locationName?.takeIf { it.isNotBlank() }?.let { Text(it) }
                current.locationAddress?.takeIf { it.isNotBlank() }?.let { Text(it) }
                val coordinates = if (current.locationLat != null && current.locationLng != null) "${current.locationLat}, ${current.locationLng}" else null
                coordinates?.let { Text(it) }
                val mapLink = current.locationMapLink?.takeIf { it.isNotBlank() }
                    ?: coordinates?.let { com.trails.app.util.mapsSearchUrl(it) }
                mapLink?.let {
                    InfoDetailLink(stringResource(R.string.idea_open_in_maps)) { openExternalUrl(context, it) }
                }
            }
        }
        if (listOf(current.contactName, current.contactPhone, current.contactEmail).any { !it.isNullOrBlank() }) {
            TrailsCard {
                ScreenHeading(emoji = "👤", title = stringResource(R.string.info_detail_contact))
                current.contactName?.takeIf { it.isNotBlank() }?.let { Text(it) }
                current.contactPhone?.takeIf { it.isNotBlank() }?.let {
                    InfoDetailLink(it) { openExternalUrl(context, "tel:" + android.net.Uri.encode(it)) }
                }
                current.contactEmail?.takeIf { it.isNotBlank() }?.let {
                    InfoDetailLink(it) { openExternalUrl(context, "mailto:" + android.net.Uri.encode(it)) }
                }
            }
        }
        if (links.isNotEmpty()) TrailsCard {
            ScreenHeading(emoji = "🔗", title = stringResource(R.string.idea_edit_links_heading))
            links.forEach { link ->
                InfoDetailLink(link.label?.takeIf { it.isNotBlank() } ?: link.url) { openExternalUrl(context, link.url) }
            }
        }
        if (tags.isNotEmpty()) TrailsCard {
            ScreenHeading(emoji = "🏷️", title = stringResource(R.string.info_detail_tags))
            tags.forEach { Text(it.text) }
        }
        if (photos.isNotEmpty() || attachments.isNotEmpty()) TrailsCard {
            ScreenHeading(emoji = "📎", title = stringResource(R.string.info_documents_photos_heading))
            photos.filterNot(::isUsablePhotoCache).forEach { photo ->
                InfoDetailLink(stringResource(R.string.info_detail_load_photo, photo.originalFilename)) { onOpenPhoto(photo.id) }
            }
            photos.filter(::isUsablePhotoCache).forEach { photo ->
                AsyncImage(model = File(checkNotNull(photo.localPath)), contentDescription = photo.originalFilename,
                    modifier = Modifier.fillMaxWidth().heightIn(max = 360.dp).clickable {
                        onOpenPhoto(photo.id)
                    })
            }
            attachments.forEach { attachment ->
                InfoDetailLink(attachment.originalFilename) {
                    onOpenAttachment(attachment.id)
                }
            }
        }
    }
}

@Composable
private fun InfoDetailLink(label: String, onClick: () -> Unit) {
    TextButton(onClick = onClick, contentPadding = PaddingValues(vertical = 8.dp)) {
        Text(label, color = TrailsColors.BrandAccent, modifier = Modifier.fillMaxWidth())
    }
}
