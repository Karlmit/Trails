package com.trails.app.data

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.IOException

class FileCacheManagerTest {
    @Test
    fun `mismatched bytes preserve destination and remove temporary file`() {
        val directory = kotlin.io.path.createTempDirectory("photo-cache").toFile()
        val destination = directory.resolve("photo.jpg").apply { writeBytes(byteArrayOf(9, 9)) }

        try {
            writeVerifiedPhoto(ByteArrayInputStream(byteArrayOf(1)), destination, expectedSize = 2)
            throw AssertionError("Expected size validation failure")
        } catch (_: IOException) {
            assertArrayEquals(byteArrayOf(9, 9), destination.readBytes())
            assertTrue(directory.listFiles().orEmpty().none { it.extension == "download" })
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `exact bytes atomically replace destination and remove temporary file`() {
        val directory = kotlin.io.path.createTempDirectory("photo-cache").toFile()
        val destination = directory.resolve("photo.jpg").apply { writeBytes(byteArrayOf(9, 9)) }

        writeVerifiedPhoto(ByteArrayInputStream(byteArrayOf(1, 2, 3)), destination, expectedSize = 3)

        assertArrayEquals(byteArrayOf(1, 2, 3), destination.readBytes())
        assertTrue(directory.listFiles().orEmpty().none { it.extension == "download" })
        directory.deleteRecursively()
    }
}
