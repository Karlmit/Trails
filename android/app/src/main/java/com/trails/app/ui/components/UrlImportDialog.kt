package com.trails.app.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.trails.app.R
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.ui.theme.TrailsShapes

/**
 * User-requested: "Make it so anywhere I can upload a photo it's also
 * possible to just post an image URL, that way the user does not have to
 * actually download the photo first."
 *
 * The one "paste a URL instead" prompt, shared by every screen that offers a
 * photo picker: IdeaEditScreen, EntryDetailScreen, ImportantInfoEditScreen
 * and BlogEditScreen. A dialog rather than an inline field (the web's
 * UrlImportField is inline) because on a phone every one of those photo
 * sections lives in a horizontally-scrolling LazyRow with no room for a text
 * field, and a URL is long -- the dialog gets the full screen width and
 * brings up the URL keyboard.
 *
 * Holds no result state of its own: the caller's ViewModel already tracks the
 * in-flight/error state for its file-picker upload, and the URL import routes
 * through that exact same state so the screen shows one spinner and one error
 * banner regardless of which way the photo came in.
 */
@Composable
fun UrlImportDialog(
    title: String,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
    placeholder: String = stringResource(R.string.url_import_placeholder),
) {
    var url by remember { mutableStateOf("") }
    val trimmed = url.trim()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column {
                Text(
                    stringResource(R.string.url_import_hint),
                    style = MaterialTheme.typography.bodySmall,
                    color = TrailsColors.TextSoft,
                )
                OutlinedTextField(
                    value = url,
                    onValueChange = { url = it },
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                    singleLine = true,
                    shape = TrailsShapes.Input,
                    placeholder = { Text(placeholder, color = TrailsColors.TextSoft) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Done),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = TrailsColors.BrandAccent,
                        unfocusedBorderColor = TrailsColors.InputBorder,
                        focusedContainerColor = TrailsColors.Surface,
                        unfocusedContainerColor = TrailsColors.Surface,
                    ),
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onConfirm(trimmed) },
                enabled = trimmed.isNotEmpty(),
            ) {
                Text(stringResource(R.string.url_import_confirm))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.url_import_cancel)) }
        },
    )
}
