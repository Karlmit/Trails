package com.trails.app.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.IconButton
import androidx.compose.material3.Icon
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.trails.app.R
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.ui.theme.TrailsShapes

data class TagFieldItem(val id: String, val text: String)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TagsEditor(
    tags: List<TagFieldItem>,
    onAdd: (String) -> Unit,
    onRemove: (TagFieldItem) -> Unit,
    modifier: Modifier = Modifier,
) {
    var draft by remember { mutableStateOf("") }
    Column(modifier = modifier.fillMaxWidth()) {
        Text(text = stringResource(R.string.shared_tags_label), style = MaterialTheme.typography.labelMedium, color = TrailsColors.TextSoft)
        FlowRow(modifier = Modifier.fillMaxWidth().padding(top = 6.dp)) {
            tags.forEach { tag ->
                Surface(
                    modifier = Modifier.padding(end = 6.dp, bottom = 6.dp),
                    shape = TrailsShapes.Pill,
                    color = TrailsColors.SurfaceCool,
                    contentColor = TrailsColors.TextSoft,
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(tag.text, modifier = Modifier.padding(start = 12.dp, top = 6.dp, bottom = 6.dp))
                        IconButton(onClick = { onRemove(tag) }, modifier = Modifier.padding(end = 2.dp)) {
                            Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.shared_remove_tag, tag.text))
                        }
                    }
                }
            }
        }
        Row(modifier = Modifier.fillMaxWidth().padding(top = 4.dp)) {
            OutlinedTextField(
                value = draft,
                onValueChange = { draft = it },
                modifier = Modifier.fillMaxWidth(0.7f),
                singleLine = true,
                placeholder = { Text(stringResource(R.string.shared_add_tag_placeholder)) },
                shape = TrailsShapes.Input,
            )
            TextButton(
                onClick = {
                    val trimmed = draft.trim()
                    if (trimmed.isNotEmpty()) {
                        onAdd(trimmed)
                        draft = ""
                    }
                },
            ) { Text(stringResource(R.string.shared_add_button)) }
        }
    }
}
