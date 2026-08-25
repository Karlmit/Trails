package com.trails.app.ui.ideas

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import coil3.compose.AsyncImage
import com.trails.app.R
import com.trails.app.ui.components.ErrorBanner
import com.trails.app.ui.components.PillButton
import com.trails.app.ui.components.PillButtonVariant
import com.trails.app.ui.components.ScreenHeading
import com.trails.app.ui.components.TrailsCard
import com.trails.app.ui.sections.SectionsViewModel
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.util.openExternalUrl
import java.io.File

/** Read-only view of one Idea -- mirrors components/IdeaCard.tsx's own view mode. Editing is IdeaEditScreen's job, reached via this screen's Edit action (TrailsNavHost's TopAppBar action). */
@Composable
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

    if (idea == null) {
        Text(stringResource(R.string.timeline_loading), modifier = Modifier.padding(padding), color = TrailsColors.TextSoft)
        return
    }
    val currentIdea = idea!!

    Column(
        modifier = Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        val errorText = error ?: errorRes?.let { stringResource(it) }
        errorText?.let { ErrorBanner(it) }

        TrailsCard {
            ScreenHeading(
                emoji = "💡",
                title = currentIdea.title,
                subtitle = buildString {
                    append(IDEA_PRIORITY_LABEL_RES[currentIdea.priority]?.let { stringResource(it) } ?: currentIdea.priority)
                    append(" · ")
                    append(IDEA_WEATHER_LABEL_RES[currentIdea.weatherSuitability]?.let { stringResource(it) } ?: currentIdea.weatherSuitability)
                    currentIdea.sectionId?.let { id -> sections.find { it.id == id }?.let { append(" · ${it.name}") } }
                },
            )
            currentIdea.category?.let { Field(stringResource(R.string.idea_edit_label_category), it) }
            currentIdea.description?.let { Field(stringResource(R.string.idea_edit_label_description), it) }
            if (currentIdea.locationAddress != null || currentIdea.locationMapLink != null) {
                Column {
                    Text(stringResource(R.string.idea_edit_label_location_address).uppercase(), style = MaterialTheme.typography.labelMedium, color = TrailsColors.TextSoft)
                    currentIdea.locationAddress?.let {
                        Text(it, style = MaterialTheme.typography.bodyLarge, color = TrailsColors.Text)
                    }
                    currentIdea.locationMapLink?.let { link ->
                        Text(
                            stringResource(R.string.idea_open_in_maps),
                            style = MaterialTheme.typography.bodyMedium,
                            color = TrailsColors.BrandAccent,
                            modifier = Modifier.padding(top = 2.dp).clickable { openExternalUrl(context, link) },
                        )
                    }
                }
            }
            if (currentIdea.estimatedExpenseAmount != null && currentIdea.estimatedExpenseCurrency != null) {
                Field(stringResource(R.string.idea_edit_label_expense_amount), "${currentIdea.estimatedExpenseAmount} ${currentIdea.estimatedExpenseCurrency}")
            }

            if (converting) {
                CircularProgressIndicator(modifier = Modifier.padding(top = 4.dp))
            } else {
                PillButton(
                    text = stringResource(R.string.idea_edit_convert_button),
                    variant = PillButtonVariant.Outline,
                    onClick = { showConvertConfirm = true },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }

        if (links.isNotEmpty()) {
            TrailsCard {
                ScreenHeading(emoji = "🔗", title = stringResource(R.string.idea_edit_links_heading))
                Column {
                    links.forEach { link ->
                        Text(
                            link.label?.takeIf { it.isNotBlank() } ?: link.url,
                            style = MaterialTheme.typography.bodyLarge,
                            color = TrailsColors.BrandAccent,
                            modifier = Modifier.padding(vertical = 4.dp).clickable { openExternalUrl(context, link.url) },
                        )
                    }
                }
            }
        }

        if (photos.isNotEmpty()) {
            TrailsCard {
                ScreenHeading(emoji = "📷", title = stringResource(R.string.idea_detail_photos_heading))
                LazyRow {
                    items(photos, key = { it.id }) { photo ->
                        if (photo.localPath != null) {
                            AsyncImage(
                                model = File(photo.localPath),
                                contentDescription = null,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.size(88.dp).padding(end = 8.dp).clip(RoundedCornerShape(8.dp)),
                            )
                        }
                    }
                }
            }
        }
    }

    if (showConvertConfirm) {
        AlertDialog(
            onDismissRequest = { showConvertConfirm = false },
            title = { Text(stringResource(R.string.idea_edit_convert_dialog_title)) },
            text = { Text(stringResource(R.string.idea_edit_convert_dialog_text)) },
            confirmButton = { TextButton(onClick = { showConvertConfirm = false; viewModel.convertToEntry() }) { Text(stringResource(R.string.idea_edit_convert_confirm_button)) } },
            dismissButton = { TextButton(onClick = { showConvertConfirm = false }) { Text(stringResource(R.string.idea_edit_convert_cancel_button)) } },
        )
    }
}

@Composable
private fun Field(label: String, value: String) {
    Column {
        Text(label.uppercase(), style = MaterialTheme.typography.labelMedium, color = TrailsColors.TextSoft)
        Text(value, style = MaterialTheme.typography.bodyLarge, color = TrailsColors.Text)
    }
}
