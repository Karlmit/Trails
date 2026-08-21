package com.trails.app.util

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns

/** Resolves the picker-supplied content:// Uri's display name -- falls back to the last path segment if the provider doesn't expose one. */
fun queryDisplayName(context: Context, uri: Uri): String {
    context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        if (nameIndex >= 0 && cursor.moveToFirst()) {
            cursor.getString(nameIndex)?.let { return it }
        }
    }
    return uri.lastPathSegment ?: "file"
}
