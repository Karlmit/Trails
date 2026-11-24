package com.trails.app.ui.blog

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.io.RandomAccessFile

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34])
class SmallerBlogPhotoEncodingTest {
    @get:Rule val files = TemporaryFolder()

    @Test
    fun `creates a compatible copy and removes it after sending without modifying the draft`() = runBlocking {
        val source = files.newFile("draft.jpg")
        val bitmap = Bitmap.createBitmap(320, 160, Bitmap.Config.ARGB_8888)
        bitmap.setHasAlpha(false)
        source.outputStream().use { assertTrue(bitmap.compress(Bitmap.CompressFormat.JPEG, 95, it)) }
        bitmap.recycle()
        val originalLength = COMPATIBLE_PHOTO_BYTES + 100
        RandomAccessFile(source, "rw").use { it.setLength(originalLength) }

        val temporary: File = withSmallerBlogPhoto(source, "draft.jpg") { smaller ->
            assertTrue(smaller.file.length() in 1..COMPATIBLE_PHOTO_BYTES)
            assertEquals("image/jpeg", smaller.mimeType)
            assertEquals(320, BitmapFactory.decodeFile(smaller.file.absolutePath).width)
            assertEquals(originalLength, source.length())
            smaller.file
        }

        assertFalse(temporary.exists())
        assertEquals(originalLength, source.length())
    }
}
