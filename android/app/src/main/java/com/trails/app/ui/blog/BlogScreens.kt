package com.trails.app.ui.blog

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import coil3.compose.AsyncImage
import com.trails.app.R
import com.trails.app.ui.components.EmptyState
import com.trails.app.ui.components.PullToRefreshScreen
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.ui.theme.TrailsShapes
import com.trails.app.ui.components.TrailsCard
import com.trails.app.ui.components.TrailsCardVariant
import java.io.File

private fun runsToAnnotatedString(runs: List<InlineRun>) = buildAnnotatedString {
    runs.forEach { run ->
        withStyle(
            SpanStyle(
                fontWeight = if (run.bold) FontWeight.Bold else FontWeight.Normal,
                fontStyle = if (run.italic) androidx.compose.ui.text.font.FontStyle.Italic else androidx.compose.ui.text.font.FontStyle.Normal,
                textDecoration = if (run.underline) TextDecoration.Underline else TextDecoration.None,
            ),
        ) { append(run.text) }
    }
}

@Composable
fun BlogListScreen(
    padding: PaddingValues,
    onOpenPost: (String) -> Unit,
    onOpenDraft: (String) -> Unit,
    onOpenStatistics: () -> Unit,
    viewModel: BlogListViewModel = hiltViewModel(),
) {
    val posts by viewModel.posts.collectAsState()
    val drafts by viewModel.drafts.collectAsState()
    val draftEntryIds = drafts.mapNotNull { it.entryId }.toSet()
    val visiblePosts = posts.filterNot { it.entry.publishedAt == null && it.entry.id in draftEntryIds }
    val isRefreshing by viewModel.isRefreshing.collectAsState()

    PullToRefreshScreen(isRefreshing = isRefreshing, onRefresh = viewModel::refresh, modifier = Modifier.padding(padding).fillMaxSize()) {
        LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp)) {
            item {
                TextButton(onClick = onOpenStatistics) { Text(stringResource(R.string.blog_statistics_title)) }
            }
            if (visiblePosts.isEmpty() && drafts.isEmpty()) {
                item { EmptyState(emoji = "📖", message = stringResource(R.string.blog_empty_state)) }
            }
            items(drafts, key = { "draft-${it.id}" }) { draft ->
                TrailsCard(
                    modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp).clickable { onOpenDraft(draft.id) },
                    variant = TrailsCardVariant.Standard,
                ) {
                    Text(
                        draft.title.ifBlank { stringResource(R.string.blog_untitled_default) },
                        style = MaterialTheme.typography.titleMedium,
                        color = TrailsColors.BrandDeep,
                    )
                    Text(stringResource(R.string.blog_device_draft), color = TrailsColors.TextSoft)
                }
            }
            items(visiblePosts, key = { it.entry.id }) { item ->
                TrailsCard(
                    modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp).clickable { onOpenPost(item.entry.id) },
                    variant = TrailsCardVariant.Standard,
                    contentPadding = PaddingValues(0.dp),
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("📖 ${item.entry.title}", style = MaterialTheme.typography.titleMedium, color = TrailsColors.BrandDeep)
                        if (item.excerpt.isNotBlank()) {
                            Text(item.excerpt, style = MaterialTheme.typography.bodyMedium, color = TrailsColors.TextSoft, modifier = Modifier.padding(top = 6.dp))
                        }
                        Text(item.entry.startAt.take(10), style = MaterialTheme.typography.bodySmall, color = TrailsColors.TextSoft, modifier = Modifier.padding(top = 6.dp))
                    }
                }
            }
        }
    }
}

@Composable
fun BlogDetailScreen(padding: PaddingValues, onOpenPhoto: (String) -> Unit, viewModel: BlogDetailViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsState()
    val collagePaths by viewModel.collagePhotoPaths.collectAsState()
    val entry = state.entry
    val stats by viewModel.stats.collectAsState()
    val isPublished = entry?.publishedAt != null
    LaunchedEffect(isPublished) {
        if (isPublished) viewModel.loadStatsForVisit()
    }
    var activeVideoIndex by remember(entry?.id, state.blocks) { mutableStateOf<Int?>(null) }
    val isRefreshing by viewModel.isRefreshing.collectAsState()

    PullToRefreshScreen(isRefreshing = isRefreshing, onRefresh = viewModel::refresh, modifier = Modifier.padding(padding).fillMaxSize()) {
        if (entry == null) {
            Text(stringResource(R.string.blog_loading), modifier = Modifier.align(Alignment.Center), color = TrailsColors.TextSoft)
        } else {
            LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp)) {
                item {
                    Text(entry.title, style = MaterialTheme.typography.titleLarge, color = TrailsColors.Brand)
                    Text(
                        entry.startAt.take(10),
                        style = MaterialTheme.typography.bodySmall,
                        color = TrailsColors.TextSoft,
                        modifier = Modifier.padding(top = 4.dp, bottom = 16.dp),
                    )
                }
                if (isPublished) {
                    item { BlogViewStats(stats, onRefresh = viewModel::refreshStats) }
                }
                // Numbering restarts at 1 whenever a non-numbered block breaks a
                // run of consecutive NUMBERED_LIST blocks -- same as an HTML <ol>.
                val listNumbers = run {
                    val numbers = IntArray(state.blocks.size)
                    var counter = 0
                    state.blocks.forEachIndexed { i, b ->
                        counter = if (b is BlogBlock.TextBlock && b.kind == TextBlockKind.NUMBERED_LIST) counter + 1 else 0
                        numbers[i] = counter
                    }
                    numbers
                }
                itemsIndexed(state.blocks) { index, block ->
                    when (block) {
                        is BlogBlock.TextBlock -> {
                            val textStyle = when (block.kind) {
                                TextBlockKind.HEADING_1 -> MaterialTheme.typography.headlineMedium
                                TextBlockKind.HEADING_2 -> MaterialTheme.typography.headlineSmall
                                TextBlockKind.HEADING_3 -> MaterialTheme.typography.titleLarge
                                else -> MaterialTheme.typography.bodyLarge
                            }
                            when (block.kind) {
                                TextBlockKind.BULLET_LIST, TextBlockKind.NUMBERED_LIST -> Row(modifier = Modifier.padding(bottom = 4.dp)) {
                                    Text(
                                        if (block.kind == TextBlockKind.BULLET_LIST) "•" else "${listNumbers[index]}.",
                                        style = textStyle,
                                        color = TrailsColors.Text,
                                        modifier = Modifier.padding(end = 8.dp),
                                    )
                                    Text(runsToAnnotatedString(block.runs), style = textStyle, color = TrailsColors.Text)
                                }
                                else -> Text(
                                    runsToAnnotatedString(block.runs),
                                    style = textStyle,
                                    color = TrailsColors.Text,
                                    modifier = Modifier.padding(bottom = 12.dp),
                                )
                            }
                        }
                        is BlogBlock.ImageBlock -> {
                            val photo = state.photosById[block.photoId]
                            if (block.isVideo || photo?.mimeType?.startsWith("video/") == true) {
                                BlogVideo(
                                    photoId = block.photoId,
                                    photo = photo,
                                    selected = activeVideoIndex == index,
                                    onPlay = { activeVideoIndex = index },
                                    playback = viewModel.playback,
                                )
                            } else if (photo?.localPath != null) {
                                AsyncImage(
                                    model = File(photo.localPath),
                                    contentDescription = photo.originalFilename,
                                    contentScale = ContentScale.FillWidth,
                                    modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp).clip(RoundedCornerShape(4.dp))
                                        .clickable { onOpenPhoto(photo.id) },
                                )
                            } else if (photo != null) {
                                Text(photo.originalFilename, modifier = Modifier.clickable { onOpenPhoto(photo.id) }.padding(8.dp))
                            }
                        }
                        is BlogBlock.CollageBlock -> {
                            val preview: @Composable (Int, Modifier, ContentScale) -> Unit = { photoIndex, modifier, scale ->
                                val photoId = block.photoIds[photoIndex]
                                val photo = state.photosById[photoId]
                                CollagePhotoPreview(
                                    file = photo?.let { collagePaths[it.id]?.let(::File) },
                                    label = photo?.originalFilename ?: stringResource(R.string.blog_collage_photo, photoIndex + 1),
                                    onOpen = photo?.let { { onOpenPhoto(photoId) } },
                                    modifier = modifier,
                                    contentScale = scale,
                                )
                            }
                            if (block.photoIds.size == 1) {
                                preview(0, Modifier.fillMaxWidth().padding(bottom = 12.dp).clip(RoundedCornerShape(4.dp)), ContentScale.FillWidth)
                            } else {
                                PhotoCollageGrid(block.photoIds.size, Modifier.padding(bottom = 12.dp)) { photoIndex ->
                                    preview(photoIndex, Modifier.fillMaxSize(), ContentScale.Crop)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
