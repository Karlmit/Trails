package com.trails.app.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.ui.theme.TrailsShapes

/**
 * One shape covers both usages: a locally-staged list before the owning
 * resource exists (id == null, nothing hits the network yet) and the live
 * list once it does (id from the server, remove calls DELETE immediately).
 */
data class LinkFieldItem(val id: String?, val url: String, val label: String?)

@Composable
fun LinksEditor(
    links: List<LinkFieldItem>,
    onAdd: (url: String, label: String?) -> Unit,
    onRemove: (LinkFieldItem) -> Unit,
    modifier: Modifier = Modifier,
) {
    var urlDraft by remember { mutableStateOf("") }
    var labelDraft by remember { mutableStateOf("") }

    Column(modifier = modifier.fillMaxWidth()) {
        Text(text = "LINKS", style = MaterialTheme.typography.labelMedium, color = TrailsColors.TextSoft)
        links.forEach { link ->
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(link.label?.takeIf { it.isNotBlank() } ?: link.url, style = MaterialTheme.typography.bodyMedium)
                    if (!link.label.isNullOrBlank()) {
                        Text(link.url, style = MaterialTheme.typography.bodySmall, color = TrailsColors.TextSoft)
                    }
                }
                IconButton(onClick = { onRemove(link) }) {
                    Icon(Icons.Filled.Close, contentDescription = "Remove link")
                }
            }
        }
        Row(modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
            OutlinedTextField(
                value = urlDraft,
                onValueChange = { urlDraft = it },
                modifier = Modifier.weight(1f),
                singleLine = true,
                placeholder = { Text("https://…") },
                shape = TrailsShapes.Input,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = TrailsColors.BrandAccent,
                    unfocusedBorderColor = TrailsColors.InputBorder,
                    focusedContainerColor = TrailsColors.Surface,
                    unfocusedContainerColor = TrailsColors.Surface,
                ),
            )
        }
        Row(modifier = Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = labelDraft,
                onValueChange = { labelDraft = it },
                modifier = Modifier.weight(1f),
                singleLine = true,
                placeholder = { Text("Label (optional)") },
                shape = TrailsShapes.Input,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = TrailsColors.BrandAccent,
                    unfocusedBorderColor = TrailsColors.InputBorder,
                    focusedContainerColor = TrailsColors.Surface,
                    unfocusedContainerColor = TrailsColors.Surface,
                ),
            )
            TextButton(
                onClick = {
                    val trimmedUrl = urlDraft.trim()
                    if (trimmedUrl.isNotEmpty()) {
                        onAdd(trimmedUrl, labelDraft.trim().takeIf { it.isNotEmpty() })
                        urlDraft = ""
                        labelDraft = ""
                    }
                },
                modifier = Modifier.padding(start = 4.dp),
            ) { Text("Add") }
        }
    }
}
