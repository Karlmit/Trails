package com.trails.app.ui.blog

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.trails.app.R
import com.trails.app.ui.components.EmptyState
import com.trails.app.ui.components.PullToRefreshScreen
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.ui.components.TrailsCard
import com.trails.app.ui.components.TrailsCardVariant
import java.io.File

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
                    BlogReaderHeading(entry.title, entry.startAt)
                }
                if (isPublished) {
                    item { BlogViewStats(stats, onRefresh = viewModel::refreshStats) }
                }
                val listNumbers = blogListNumbers(state.blocks.map { (it as? BlogBlock.TextBlock)?.kind })
                itemsIndexed(state.blocks) { index, block ->
                    when (block) {
                        is BlogBlock.TextBlock -> BlogReaderText(block.kind, block.runs, listNumbers[index])
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
                                BlogReaderPhoto(File(photo.localPath), photo.originalFilename) { onOpenPhoto(photo.id) }
                            } else if (photo != null) {
                                Text(photo.originalFilename, modifier = Modifier.clickable { onOpenPhoto(photo.id) }.padding(8.dp))
                            }
                        }
                        is BlogBlock.CollageBlock -> {
                            BlogReaderCollage(block.photoIds.size) { photoIndex, modifier, scale ->
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
                        }
                    }
                }
            }
        }
    }
}
