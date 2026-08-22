package com.trails.app.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
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
 * A dropdown over a free-text field the user has been building up over time
 * (e.g. Idea.category) rather than a fixed server-curated set -- offers
 * "None," every known option (each removable from this device's own
 * suggestion list only, never affecting whatever any row already has
 * stored), and an inline "add a new one" entry.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreatableDropdownField(
    label: String,
    options: List<String>,
    selected: String?,
    onSelected: (String?) -> Unit,
    onAddOption: (String) -> Unit,
    onRemoveOption: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var expanded by remember { mutableStateOf(false) }
    var addingNew by remember { mutableStateOf(false) }
    var newValue by remember { mutableStateOf("") }

    Column(modifier = modifier.fillMaxWidth()) {
        Text(text = label.uppercase(), style = MaterialTheme.typography.labelMedium, color = TrailsColors.TextSoft)
        ExposedDropdownMenuBox(
            expanded = expanded,
            onExpandedChange = { expanded = it },
            modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
        ) {
            OutlinedTextField(
                value = selected ?: "None",
                onValueChange = {},
                readOnly = true,
                modifier = Modifier.fillMaxWidth().menuAnchor(),
                trailingIcon = { Icon(Icons.Filled.ArrowDropDown, contentDescription = null) },
                shape = TrailsShapes.Input,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = TrailsColors.BrandAccent,
                    unfocusedBorderColor = TrailsColors.InputBorder,
                    focusedContainerColor = TrailsColors.Surface,
                    unfocusedContainerColor = TrailsColors.Surface,
                ),
            )
            ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false; addingNew = false }) {
                DropdownMenuItem(text = { Text("None") }, onClick = { onSelected(null); expanded = false })
                options.forEach { option ->
                    DropdownMenuItem(
                        text = {
                            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                Text(option, modifier = Modifier.weight(1f))
                                IconButton(onClick = { onRemoveOption(option) }, modifier = Modifier.size(24.dp)) {
                                    Icon(Icons.Filled.Close, contentDescription = "Remove $option from list")
                                }
                            }
                        },
                        onClick = { onSelected(option); expanded = false },
                    )
                }
                if (addingNew) {
                    Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        OutlinedTextField(
                            value = newValue,
                            onValueChange = { newValue = it },
                            modifier = Modifier.weight(1f),
                            singleLine = true,
                            placeholder = { Text("New category") },
                            shape = TrailsShapes.Input,
                        )
                        TextButton(onClick = {
                            val trimmed = newValue.trim()
                            if (trimmed.isNotEmpty()) {
                                onAddOption(trimmed)
                                onSelected(trimmed)
                            }
                            newValue = ""
                            addingNew = false
                            expanded = false
                        }) { Text("Add") }
                    }
                } else {
                    DropdownMenuItem(text = { Text("+ Add new") }, onClick = { addingNew = true })
                }
            }
        }
    }
}
