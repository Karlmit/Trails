package com.trails.app.ui.ideas

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import coil3.compose.AsyncImage
import com.trails.app.R
import com.trails.app.data.entity.PhotoEntity
import com.trails.app.data.isUsablePhotoCache
import com.trails.app.data.selectIdeaCoverPhotos
import com.trails.app.ui.components.*
import com.trails.app.ui.sections.SectionsViewModel
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.ui.theme.TrailsShapes
import com.trails.app.util.openExternalUrl
import java.io.File

internal data class IdeaDetailPhotos(val cover: PhotoEntity?, val additional: List<PhotoEntity>)

/** Uses the repository's primary/newest precedence after removing invalid caches. */
internal fun selectIdeaDetailPhotos(photos: List<PhotoEntity>): IdeaDetailPhotos {
    val usable = photos.filter(::isUsablePhotoCache)
    val cover = selectIdeaCoverPhotos(usable).singleOrNull()
    return IdeaDetailPhotos(cover, usable.filterNot { it.id == cover?.id })
}

@Composable
@OptIn(ExperimentalLayoutApi::class)
fun IdeaDetailScreen(
    padding: PaddingValues,
    onConverted: () -> Unit,
    viewModel: IdeaDetailViewModel = hiltViewModel(),
    sectionsViewModel: SectionsViewModel = hiltViewModel(),
) {
    val idea by viewModel.idea.collectAsState()
    val photos by viewModel.photos.collectAsState()
    val links by viewModel.links.collectAsState()
    val converting by viewModel.converting.collectAsState()
    val converted by viewModel.converted.collectAsState()
    val error by viewModel.error.collectAsState()
    val errorRes by viewModel.errorRes.collectAsState()
    val sections by sectionsViewModel.sections.collectAsState(initial = emptyList())
    val context = LocalContext.current
    var showConvertConfirm by remember { mutableStateOf(false) }

    LaunchedEffect(converted) { if (converted) onConverted() }
    val currentIdea = idea
    if (currentIdea == null) {
        Text(stringResource(R.string.timeline_loading), modifier = Modifier.padding(padding), color = TrailsColors.TextSoft)
        return
    }
    val displayPhotos = remember(photos) { selectIdeaDetailPhotos(photos) }
    val sectionName = currentIdea.sectionId?.let { id -> sections.find { it.id == id }?.name }

    Box(modifier = Modifier.padding(padding).fillMaxSize(), contentAlignment = Alignment.TopCenter) {
        Column(
            modifier = Modifier.widthIn(max = 720.dp).fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            val errorText = error ?: errorRes?.let { stringResource(it) }
            errorText?.let { ErrorBanner(it) }

            IdeaHero(displayPhotos.cover)

            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                IdeaTitle(currentIdea.title)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(IDEA_PRIORITY_LABEL_RES[currentIdea.priority]?.let { stringResource(it) } ?: currentIdea.priority, style = MaterialTheme.typography.labelLarge, color = TrailsColors.Brand)
                    Text(IDEA_WEATHER_LABEL_RES[currentIdea.weatherSuitability]?.let { stringResource(it) } ?: currentIdea.weatherSuitability, style = MaterialTheme.typography.labelLarge, color = TrailsColors.Brand)
                    sectionName?.let {
                        Text(it, style = MaterialTheme.typography.labelLarge, color = TrailsColors.Brand)
                    }
                }
                currentIdea.category?.let { Field(stringResource(R.string.idea_edit_label_category), it) }
                currentIdea.description?.let { Field(stringResource(R.string.idea_edit_label_description), it) }
                if (currentIdea.locationAddress != null || currentIdea.locationMapLink != null) {
                    Column {
                        Text(stringResource(R.string.idea_edit_label_location_address).uppercase(), style = MaterialTheme.typography.labelMedium, color = TrailsColors.TextSoft)
                        currentIdea.locationAddress?.let { Text(it, style = MaterialTheme.typography.bodyLarge, color = TrailsColors.Text) }
                        currentIdea.locationMapLink?.let { link ->
                            Text(stringResource(R.string.idea_open_in_maps), style = MaterialTheme.typography.bodyMedium, color = TrailsColors.BrandAccent, modifier = Modifier.padding(top = 2.dp).clickable { openExternalUrl(context, link) })
                        }
                    }
                }
                if (currentIdea.estimatedExpenseAmount != null && currentIdea.estimatedExpenseCurrency != null) {
                    Field(stringResource(R.string.idea_edit_label_expense_amount), "${currentIdea.estimatedExpenseAmount} ${currentIdea.estimatedExpenseCurrency}")
                }
            }

            if (links.isNotEmpty()) {
                TrailsCard {
                    ScreenHeading(emoji = "🔗", title = stringResource(R.string.idea_edit_links_heading))
                    links.forEach { link ->
                        Text(link.label?.takeIf { it.isNotBlank() } ?: link.url, style = MaterialTheme.typography.bodyLarge, color = TrailsColors.BrandAccent, modifier = Modifier.padding(vertical = 4.dp).clickable { openExternalUrl(context, link.url) })
                    }
                }
            }

            IdeaGallery(displayPhotos.additional)

            if (converting) CircularProgressIndicator() else PillButton(
                text = stringResource(R.string.idea_edit_convert_button), variant = PillButtonVariant.Outline,
                onClick = { showConvertConfirm = true }, modifier = Modifier.fillMaxWidth(),
            )
        }
    }

    if (showConvertConfirm) AlertDialog(
        onDismissRequest = { showConvertConfirm = false },
        title = { Text(stringResource(R.string.idea_edit_convert_dialog_title)) },
        text = { Text(stringResource(R.string.idea_edit_convert_dialog_text)) },
        confirmButton = { TextButton(onClick = { showConvertConfirm = false; viewModel.convertToEntry() }) { Text(stringResource(R.string.idea_edit_convert_confirm_button)) } },
        dismissButton = { TextButton(onClick = { showConvertConfirm = false }) { Text(stringResource(R.string.idea_edit_convert_cancel_button)) } },
    )
}

@Composable
internal fun IdeaTitle(title: String) {
    Text(title, style = MaterialTheme.typography.headlineMedium, color = TrailsColors.Text, maxLines = Int.MAX_VALUE)
}

@Composable
internal fun IdeaHero(cover: PhotoEntity?) {
    cover?.let {
        AsyncImage(
            model = File(checkNotNull(it.localPath)), contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxWidth().aspectRatio(16f / 10f).clip(TrailsShapes.Hero).testTag("idea-hero"),
        )
    }
}

@Composable
internal fun IdeaGallery(additional: List<PhotoEntity>) {
    if (additional.isNotEmpty()) TrailsCard(modifier = Modifier.testTag("idea-gallery")) {
        ScreenHeading(emoji = "📷", title = stringResource(R.string.idea_detail_photos_heading))
        LazyRow {
            items(additional, key = { it.id }) { photo ->
                AsyncImage(model = File(checkNotNull(photo.localPath)), contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.size(120.dp).padding(end = 8.dp).clip(TrailsShapes.Compact))
            }
        }
    }
}

@Composable
private fun Field(label: String, value: String) {
    Column {
        Text(label.uppercase(), style = MaterialTheme.typography.labelMedium, color = TrailsColors.TextSoft)
        Text(value, style = MaterialTheme.typography.bodyLarge, color = TrailsColors.Text)
    }
}
