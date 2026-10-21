package com.trails.app.util

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.core.content.FileProvider
import com.trails.app.R
import java.io.File

fun cachedFileUri(context: Context, localPath: String) =
    File(localPath).also { require(it.isFile) { "Cached file is missing" } }.let {
        FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", it)
    }

/** Opens a cached file (Attachment/Photo bytes already downloaded by FileCacheManager) via the system viewer. */
internal fun buildOpenCachedFileIntent(context: Context, localPath: String, mimeType: String): Intent {
    val uri = cachedFileUri(context, localPath)
    return Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, mimeType)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
    }
}

fun openCachedFile(context: Context, localPath: String, mimeType: String): Boolean {
    try {
        context.startActivity(buildOpenCachedFileIntent(context, localPath, mimeType))
        return true
    } catch (_: RuntimeException) {
        Toast.makeText(context, context.getString(R.string.shell_no_app_for_file), Toast.LENGTH_SHORT).show()
        return false
    }
}

internal fun buildShareCachedFileIntent(context: Context, localPath: String, mimeType: String): Intent {
    val uri = cachedFileUri(context, localPath)
    return Intent(Intent.ACTION_SEND).apply {
        type = mimeType
        putExtra(Intent.EXTRA_STREAM, uri)
        clipData = android.content.ClipData.newRawUri("document", uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
}

fun shareCachedFile(context: Context, localPath: String, mimeType: String): Boolean {
    return try {
        val send = buildShareCachedFileIntent(context, localPath, mimeType)
        if (send.resolveActivity(context.packageManager) == null) throw ActivityNotFoundException()
        context.startActivity(Intent.createChooser(send, context.getString(R.string.document_share)))
        true
    } catch (_: RuntimeException) {
        Toast.makeText(context, context.getString(R.string.shell_no_app_for_file), Toast.LENGTH_SHORT).show()
        false
    }
}
