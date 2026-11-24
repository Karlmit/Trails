package com.trails.app.ui.blog

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.graphics.Matrix
import android.media.ExifInterface
import android.os.Build
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import kotlin.math.roundToInt

internal const val COMPATIBLE_PHOTO_BYTES = 8L * 1024 * 1024
private const val MAX_EDGE = 2400

internal fun canRetryWithSmallerPhoto(length: Long, mimeType: String, status: Int, message: String?): Boolean =
    length > COMPATIBLE_PHOTO_BYTES &&
        mimeType in setOf("image/jpeg", "image/png", "image/webp") &&
        (status == 413 || (status == 400 && message == "Request body must be multipart/form-data"))

internal data class SmallerBlogPhoto(val file: File, val filename: String, val mimeType: String)

internal suspend fun <T> withSmallerBlogPhoto(
    source: File,
    filename: String,
    upload: suspend (SmallerBlogPhoto) -> T,
): T {
    var temporary: File? = null
    try {
        val photo = withContext(Dispatchers.IO) {
            if (isAnimatedPhoto(source)) throw IOException("Cannot reduce an animated photo")
            val output = File.createTempFile("blog-upload-", ".tmp", source.parentFile)
            temporary = output
            encodeSmallerPhoto(source, output, filename)
        }
        return upload(photo)
    } finally {
        withContext(NonCancellable + Dispatchers.IO) { temporary?.delete() }
    }
}

internal fun isAnimatedPhoto(source: File): Boolean = RandomAccessFile(source, "r").use { file ->
    if (file.length() < 21) return@use false
    val signature = file.readInt()
    if (signature == 0x52494646) { // RIFF
        file.seek(8)
        val webp = file.readInt() == 0x57454250
        return@use webp && file.readInt() == 0x56503858 && run {
            file.seek(20)
            file.readUnsignedByte() and 0x02 != 0
        }
    }
    if (signature != 0x89504e47.toInt() || file.readInt() != 0x0d0a1a0a) return@use false
    while (file.filePointer + 12 <= file.length()) {
        val length = file.readInt()
        val type = file.readInt()
        if (type == 0x6163544c) return@use true // acTL, before the first IDAT
        if (type == 0x49444154 || length < 0) return@use false
        file.seek(file.filePointer + length + 4L) // Skip data and CRC.
    }
    false
}

private fun encodeSmallerPhoto(source: File, output: File, filename: String): SmallerBlogPhoto {
    var bitmap = decodePhoto(source)
    try {
        val keepTransparency = bitmap.hasAlpha()
        val format = if (keepTransparency) Bitmap.CompressFormat.PNG else Bitmap.CompressFormat.JPEG
        val extension = if (keepTransparency) "png" else "jpg"
        val mime = if (keepTransparency) "image/png" else "image/jpeg"
        var quality = 90
        while (true) {
            val encoded = output.outputStream().use { bitmap.compress(format, quality, it) }
            if (!encoded || output.length() == 0L) throw IOException("Could not prepare a smaller photo")
            if (output.length() <= COMPATIBLE_PHOTO_BYTES) {
                val basename = filename.substringBeforeLast('.', filename).take(250)
                return SmallerBlogPhoto(output, "$basename.$extension", mime)
            }
            if (bitmap.width == 1 && bitmap.height == 1) throw IOException("Could not reduce photo to the upload limit")
            val scaled = Bitmap.createScaledBitmap(
                bitmap,
                (bitmap.width * 0.75f).toInt().coerceAtLeast(1),
                (bitmap.height * 0.75f).toInt().coerceAtLeast(1),
                true,
            )
            bitmap.recycle()
            bitmap = scaled
            quality = 85
        }
    } finally {
        bitmap.recycle()
    }
}

private fun decodePhoto(source: File): Bitmap {
    if (Build.VERSION.SDK_INT >= 28) {
        return ImageDecoder.decodeBitmap(ImageDecoder.createSource(source)) { decoder, info, _ ->
            if (info.isAnimated) throw IOException("Cannot reduce an animated photo")
            decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
            val scale = MAX_EDGE.toFloat() / maxOf(info.size.width, info.size.height)
            if (scale < 1f) {
                decoder.setTargetSize(
                    (info.size.width * scale).roundToInt().coerceAtLeast(1),
                    (info.size.height * scale).roundToInt().coerceAtLeast(1),
                )
            }
        }
    }

    val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(source.absolutePath, options)
    var sample = 1
    while (maxOf(options.outWidth, options.outHeight) / sample > MAX_EDGE) sample *= 2
    val bitmap = BitmapFactory.decodeFile(source.absolutePath, BitmapFactory.Options().apply { inSampleSize = sample })
        ?: throw IOException("Could not decode photo")
    try {
        val orientation = if (options.outMimeType == "image/jpeg") {
            ExifInterface(source.absolutePath).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
        } else ExifInterface.ORIENTATION_NORMAL
        val matrix = Matrix()
        when (orientation) {
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.setScale(-1f, 1f)
            ExifInterface.ORIENTATION_ROTATE_180 -> matrix.setRotate(180f)
            ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.setScale(1f, -1f)
            ExifInterface.ORIENTATION_TRANSPOSE -> { matrix.setRotate(90f); matrix.postScale(-1f, 1f) }
            ExifInterface.ORIENTATION_ROTATE_90 -> matrix.setRotate(90f)
            ExifInterface.ORIENTATION_TRANSVERSE -> { matrix.setRotate(-90f); matrix.postScale(-1f, 1f) }
            ExifInterface.ORIENTATION_ROTATE_270 -> matrix.setRotate(-90f)
        }
        return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
            .also { if (it !== bitmap) bitmap.recycle() }
    } catch (failure: Exception) {
        bitmap.recycle()
        throw failure
    }
}
