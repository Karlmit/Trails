package com.trails.app.network

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import okio.Buffer
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class UploadProgressBodyTest {
    @Test
    fun `reports file bytes without changing payload or content headers`() {
        val content = ByteArray(20_000) { (it % 251).toByte() }
        val type = "image/jpeg".toMediaType()
        val counts = mutableListOf<Long>()
        val body = UploadProgressBody(content.toRequestBody(type)) { counts.add(it) }
        val sink = Buffer()

        body.writeTo(sink)

        assertEquals(type, body.contentType())
        assertEquals(content.size.toLong(), body.contentLength())
        assertArrayEquals(content, sink.readByteArray())
        assertEquals(0L, counts.first())
        assertTrue(counts.zipWithNext().all { (previous, next) -> next > previous })
        assertEquals(content.size.toLong(), counts.last())
    }
}
