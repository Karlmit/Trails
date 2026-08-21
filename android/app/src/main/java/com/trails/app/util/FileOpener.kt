package com.trails.app.util

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.core.content.FileProvider
import java.io.File

/** Opens a cached file (Attachment/Photo bytes already downloaded by FileCacheManager) via the system viewer. */
fun openCachedFile(context: Context, localPath: String, mimeType: String) {
    val file = File(localPath)
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
    val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, mimeType)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    try {
        context.startActivity(intent)
    } catch (_: ActivityNotFoundException) {
        Toast.makeText(context, "No app installed that can open this file", Toast.LENGTH_SHORT).show()
    }
}
