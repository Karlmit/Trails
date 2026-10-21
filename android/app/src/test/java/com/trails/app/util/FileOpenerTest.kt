package com.trails.app.util

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assert.assertFalse
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File

@RunWith(RobolectricTestRunner::class)
class FileOpenerTest {
    private val context = ApplicationProvider.getApplicationContext<Context>()
    private val file = File(context.filesDir, "attachments/test/ticket.pdf").apply {
        parentFile!!.mkdirs()
        writeBytes(byteArrayOf(1, 2, 3))
    }

    @Test
    fun `open and share intents expose content uri mime clip data and read grants`() {
        val open = buildOpenCachedFileIntent(context, file.absolutePath, "application/pdf")

        assertEquals(Intent.ACTION_VIEW, open.action)
        assertEquals("application/pdf", open.type)
        assertEquals("content", open.data?.scheme)
        assertTrue(open.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION != 0)
        assertTrue(open.flags and Intent.FLAG_ACTIVITY_NEW_TASK != 0)

        val share = buildShareCachedFileIntent(context, file.absolutePath, "application/pdf")
        val stream = share.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)

        assertEquals(Intent.ACTION_SEND, share.action)
        assertEquals("application/pdf", share.type)
        assertEquals("content", stream?.scheme)
        assertNotNull(share.clipData)
        assertEquals(stream, share.clipData!!.getItemAt(0).uri)
        assertTrue(share.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION != 0)
    }

    @Test
    fun `missing cached files do not crash toolbar actions`() {
        val missing = File(context.filesDir, "attachments/missing.pdf")
        assertFalse(openCachedFile(context, missing.absolutePath, "application/pdf"))
        assertFalse(shareCachedFile(context, missing.absolutePath, "application/pdf"))
    }
}
