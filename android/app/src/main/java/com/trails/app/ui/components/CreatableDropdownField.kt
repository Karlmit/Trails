package com.trails.app.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.AlertDialog
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.trails.app.R
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
    val newValueFocusRequester = remember { FocusRequester() }
    val keyboardController = LocalSoftwareKeyboardController.current

    // The "add a new category" field never got the keyboard when it lived
    // inline inside this dropdown's own Popup, even with an explicit
    // requestFocus()/show() -- a DropdownMenu's Popup window doesn't
    // reliably accept IME focus regardless of Compose-level focus state
    // (a known Compose/Android platform limitation, not something fixable
    // from inside that Popup). A real AlertDialog uses its own proper
    // Dialog window, which does support the keyboard correctly -- so
    // "Add new" now closes the dropdown and opens one instead of adding a
    // row inside it.
    LaunchedEffect(addingNew) {
        if (addingNew) {
            newValueFocusRequester.requestFocus()
            keyboardController?.show()
        }
    }

    if (addingNew) {
        AlertDialog(
            onDismissRequest = { addingNew = false; newValue = "" },
            title = { Text(stringResource(R.string.shared_add_new_option)) },
            text = {
                OutlinedTextField(
                    value = newValue,
                    onValueChange = { newValue = it },
                    modifier = Modifier.fillMaxWidth().focusRequester(newValueFocusRequester),
                    singleLine = true,
                    placeholder = { Text(stringResource(R.string.shared_new_category_placeholder)) },
                    shape = TrailsShapes.Input,
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    val trimmed = newValue.trim()
                    if (trimmed.isNotEmpty()) {
                        onAddOption(trimmed)
                        onSelected(trimmed)
                    }
                    newValue = ""
                    addingNew = false
                }) { Text(stringResource(R.string.shared_add_button)) }
            },
            dismissButton = {
                TextButton(onClick = { addingNew = false; newValue = "" }) { Text(stringResource(R.string.shared_cancel_button)) }
            },
        )
    }

    Column(modifier = modifier.fillMaxWidth()) {
        Text(text = label.uppercase(), style = MaterialTheme.typography.labelMedium, color = TrailsColors.TextSoft)
        ExposedDropdownMenuBox(
            expanded = expanded,
            onExpandedChange = { expanded = it },
            modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
        ) {
            val noneLabel = stringResource(R.string.shared_none)
            OutlinedTextField(
                value = selected ?: noneLabel,
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
            ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                DropdownMenuItem(text = { Text(noneLabel) }, onClick = { onSelected(null); expanded = false })
                options.forEach { option ->
                    DropdownMenuItem(
                        text = {
                            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                Text(option, modifier = Modifier.weight(1f))
                                IconButton(onClick = { onRemoveOption(option) }, modifier = Modifier.size(24.dp)) {
                                    Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.shared_remove_option_from_list, option))
                                }
                            }
                        },
                        onClick = { onSelected(option); expanded = false },
                    )
                }
                DropdownMenuItem(text = { Text(stringResource(R.string.shared_add_new_option)) }, onClick = { expanded = false; addingNew = true })
            }
        }
    }
}
