package com.trails.app.ui.blog

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import coil3.compose.AsyncImage
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.ui.theme.TrailsShapes
import java.io.File

@Composable
fun BlogListScreen(
    padding: PaddingValues,
    onOpenPost: (String) -> Unit,
    viewModel: BlogListViewModel = hiltViewModel(),
) {
    val posts by viewModel.posts.collectAsState()

    Box(modifier = Modifier.padding(padding).fillMaxSize()) {
        if (posts.isEmpty()) {
            Text("No published posts yet.", modifier = Modifier.align(Alignment.Center).padding(24.dp), color = TrailsColors.TextSoft)
        } else {
            LazyColumn(contentPadding = PaddingValues(16.dp)) {
                items(posts, key = { it.entry.id }) { item ->
                    Card(
                        modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp).clickable { onOpenPost(item.entry.id) },
                        shape = TrailsShapes.Card,
                        colors = CardDefaults.cardColors(containerColor = TrailsColors.Surface),
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

    Box(modifier = Modifier.padding(padding).fillMaxSize()) {
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
                items(state.blocks) { block ->
                    when (block) {
                        is BlogBlock.TextBlock -> Text(
                            block.text,
                            style = MaterialTheme.typography.bodyLarge,
                            color = TrailsColors.Text,
                            modifier = Modifier.padding(bottom = 12.dp),
                        )
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
