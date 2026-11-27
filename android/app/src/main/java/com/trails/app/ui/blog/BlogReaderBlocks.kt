package com.trails.app.ui.blog

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.trails.app.ui.theme.TrailsColors
import java.io.File

private fun runsToAnnotatedString(runs: List<InlineRun>) = buildAnnotatedString {
    runs.forEach { run ->
        withStyle(
            SpanStyle(
                fontWeight = if (run.bold) FontWeight.Bold else FontWeight.Normal,
                fontStyle = if (run.italic) FontStyle.Italic else FontStyle.Normal,
                textDecoration = if (run.underline) TextDecoration.Underline else TextDecoration.None,
            ),
        ) { append(run.text) }
    }
}

internal fun blogListNumbers(kinds: List<TextBlockKind?>): IntArray {
    var counter = 0
    return IntArray(kinds.size) { index ->
        counter = if (kinds[index] == TextBlockKind.NUMBERED_LIST) counter + 1 else 0
        counter
    }
}

@Composable
internal fun BlogReaderHeading(title: String, startAt: String) {
    Text(title, style = MaterialTheme.typography.titleLarge, color = TrailsColors.Brand)
    Text(
        startAt.take(10),
        style = MaterialTheme.typography.bodySmall,
        color = TrailsColors.TextSoft,
        modifier = Modifier.padding(top = 4.dp, bottom = 16.dp),
    )
}

@Composable
internal fun BlogReaderText(kind: TextBlockKind, runs: List<InlineRun>, listNumber: Int) {
    val textStyle = when (kind) {
        TextBlockKind.HEADING_1 -> MaterialTheme.typography.headlineMedium
        TextBlockKind.HEADING_2 -> MaterialTheme.typography.headlineSmall
        TextBlockKind.HEADING_3 -> MaterialTheme.typography.titleLarge
        else -> MaterialTheme.typography.bodyLarge
    }
    val text = runsToAnnotatedString(runs)
    when (kind) {
        TextBlockKind.BULLET_LIST, TextBlockKind.NUMBERED_LIST -> Row(modifier = Modifier.padding(bottom = 4.dp)) {
            Text(
                if (kind == TextBlockKind.BULLET_LIST) "•" else "$listNumber.",
                style = textStyle,
                color = TrailsColors.Text,
                modifier = Modifier.padding(end = 8.dp),
            )
            Text(text, style = textStyle, color = TrailsColors.Text)
        }
        else -> Text(text, style = textStyle, color = TrailsColors.Text, modifier = Modifier.padding(bottom = 12.dp))
    }
}

@Composable
internal fun BlogReaderPhoto(file: File, label: String, onOpen: () -> Unit) {
    CollagePhotoPreview(
        file = file,
        label = label,
        onOpen = onOpen,
        contentScale = ContentScale.FillWidth,
        modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp).clip(RoundedCornerShape(4.dp)),
    )
}

@Composable
internal fun BlogReaderCollage(
    photoCount: Int,
    photo: @Composable (Int, Modifier, ContentScale) -> Unit,
) {
    if (photoCount == 1) {
        photo(0, Modifier.fillMaxWidth().padding(bottom = 12.dp).clip(RoundedCornerShape(4.dp)), ContentScale.FillWidth)
    } else {
        PhotoCollageGrid(photoCount, Modifier.padding(bottom = 12.dp)) { index ->
            photo(index, Modifier.fillMaxSize(), ContentScale.Crop)
        }
    }
}
