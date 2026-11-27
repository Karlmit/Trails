package com.trails.app.ui.blog

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.trails.app.ui.theme.TrailsColors
import java.io.File

@Composable
internal fun PhotoCollageGrid(count: Int, modifier: Modifier = Modifier, tile: @Composable BoxScope.(Int) -> Unit) {
    val rows = photoCollageRows(count)
    if (rows.isEmpty()) return
    var offset = 0
    Column(modifier.fillMaxWidth().aspectRatio(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        rows.forEach { columns ->
            val rowStart = offset
            offset += columns
            Row(Modifier.fillMaxWidth().weight(1f), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                repeat(columns) { column ->
                    Box(Modifier.weight(1f).fillMaxSize().clip(RoundedCornerShape(4.dp))) {
                        tile(rowStart + column)
                    }
                }
            }
        }
    }
}

@Composable
internal fun CollagePhotoPreview(
    file: File?,
    label: String,
    onOpen: (() -> Unit)?,
    modifier: Modifier = Modifier.fillMaxSize(),
    contentScale: ContentScale = ContentScale.Crop,
) {
    var failed by remember(file) { mutableStateOf(false) }
    Box(
        modifier = modifier.background(TrailsColors.SurfaceCool)
            .then(if (onOpen != null) Modifier.clickable(role = Role.Button, onClick = onOpen) else Modifier),
        contentAlignment = Alignment.Center,
    ) {
        if (file != null && !failed) {
            AsyncImage(
                model = file,
                contentDescription = label,
                contentScale = contentScale,
                modifier = Modifier.fillMaxSize(),
                onError = { failed = true },
            )
        } else {
            Text(label, Modifier.padding(8.dp), maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}
