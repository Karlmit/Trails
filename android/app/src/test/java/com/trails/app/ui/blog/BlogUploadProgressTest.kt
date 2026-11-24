package com.trails.app.ui.blog

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class BlogUploadProgressTest {
    @Test
    fun `uses current upload rate and existing confirmed bytes to estimate remaining time`() {
        val initial = BlogUploadProgress(totalPhotos = 3, completedPhotos = 1, totalBytes = 800, sentBytes = 200)
        val progress = initial.sending(photoBytes = 400, bytes = 200, elapsedMillis = 4_000, hasPendingImports = false)

        assertEquals(400L, progress.sentBytes)
        assertEquals(0.5f, progress.fraction, 0.001f)
        assertEquals(8, progress.remainingSeconds)
    }

    @Test
    fun `holds the bar before completion and omits time estimates for pending URL imports`() {
        val initial = BlogUploadProgress(totalPhotos = 2, completedPhotos = 0, totalBytes = 400)
        val progress = initial.sending(photoBytes = 400, bytes = 400, elapsedMillis = 2_000, hasPendingImports = true)

        assertEquals(0.495f, progress.fraction, 0.001f)
        assertNull(progress.remainingSeconds)
    }
}
