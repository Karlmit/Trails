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
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import coil3.compose.AsyncImage
import com.trails.app.ui.components.EmptyState
import com.trails.app.ui.components.PullToRefreshScreen
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.ui.theme.TrailsShapes
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
    viewModel: BlogListViewModel = hiltViewModel(),
) {
    val posts by viewModel.posts.collectAsState()
    val isRefreshing by viewModel.isRefreshing.collectAsState()

    PullToRefreshScreen(isRefreshing = isRefreshing, onRefresh = viewModel::refresh, modifier = Modifier.padding(padding).fillMaxSize()) {
        if (posts.isEmpty()) {
            EmptyState(
                emoji = "📖",
                message = "No posts published yet.\nWrite about the trip -- it'll show up here.",
                modifier = Modifier.align(Alignment.Center),
            )
        } else {
            LazyColumn(contentPadding = PaddingValues(16.dp)) {
                items(posts, key = { it.entry.id }) { item ->
                    ElevatedCard(
                        modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp).clickable { onOpenPost(item.entry.id) },
                        shape = TrailsShapes.Card,
                        colors = CardDefaults.elevatedCardColors(containerColor = TrailsColors.Surface),
                        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 1.dp),
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
}

@Composable
fun BlogDetailScreen(padding: PaddingValues, viewModel: BlogDetailViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsState()
    val entry = state.entry
    val isRefreshing by viewModel.isRefreshing.collectAsState()

    PullToRefreshScreen(isRefreshing = isRefreshing, onRefresh = viewModel::refresh, modifier = Modifier.padding(padding).fillMaxSize()) {
        if (entry == null) {
            Text("Loading…", modifier = Modifier.align(Alignment.Center), color = TrailsColors.TextSoft)
        } else {
            LazyColumn(contentPadding = PaddingValues(20.dp)) {
                item {
                    Text(entry.title, style = MaterialTheme.typography.titleLarge, color = TrailsColors.Brand)
                    Text(
                        entry.startAt.take(10),
                        style = MaterialTheme.typography.bodySmall,
                        color = TrailsColors.TextSoft,
                        modifier = Modifier.padding(top = 4.dp, bottom = 16.dp),
                    )
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
                            if (photo?.localPath != null) {
                                AsyncImage(
                                    model = File(photo.localPath),
                                    contentDescription = null,
                                    contentScale = ContentScale.FillWidth,
                                    modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp).clip(RoundedCornerShape(4.dp)),
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
