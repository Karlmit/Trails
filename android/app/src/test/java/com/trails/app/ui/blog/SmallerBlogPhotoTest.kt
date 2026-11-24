package com.trails.app.ui.blog

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class SmallerBlogPhotoTest {
    @get:Rule val files = TemporaryFolder()

    @Test
    fun `retry is limited to large still photos rejected before storage`() {
        val large = COMPATIBLE_PHOTO_BYTES + 1
        val multipart = "Request body must be multipart/form-data"
        assertTrue(canRetryWithSmallerPhoto(large, "image/jpeg", 400, multipart))
        assertTrue(canRetryWithSmallerPhoto(large, "image/png", 413, null))
        assertFalse(canRetryWithSmallerPhoto(large, "image/jpeg", 500, multipart))
        assertFalse(canRetryWithSmallerPhoto(large, "image/jpeg", 400, "Unsupported file type"))
        assertFalse(canRetryWithSmallerPhoto(large, "image/gif", 400, multipart))
        assertFalse(canRetryWithSmallerPhoto(large - 1, "image/jpeg", 400, multipart))
    }

    @Test
    fun `detects WebP and PNG animation headers before decoding`() {
        val webp = files.newFile("animated.webp")
        webp.writeBytes("RIFF".toByteArray() + ByteArray(4) + "WEBPVP8X".toByteArray() + ByteArray(4) + byteArrayOf(2))
        assertTrue(isAnimatedPhoto(webp))
        val png = files.newFile("animated.png")
        png.writeBytes(byteArrayOf(0x89.toByte(), 80, 78, 71, 13, 10, 26, 10) +
            byteArrayOf(0, 0, 0, 8) + "acTL".toByteArray() + ByteArray(12))
        assertTrue(isAnimatedPhoto(png))
        webp.writeBytes(webp.readBytes().also { it[20] = 0 })
        assertFalse(isAnimatedPhoto(webp))
    }
}
