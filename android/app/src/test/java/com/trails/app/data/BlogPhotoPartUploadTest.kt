package com.trails.app.data

import com.trails.app.network.TrailsApiService
import com.trails.app.network.dto.BlogPhotoUploadDto
import com.trails.app.network.dto.PhotoDto
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import okhttp3.RequestBody
import okio.Buffer
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class BlogPhotoPartUploadTest {
    @get:Rule val files = TemporaryFolder()

    @Test
    fun `sends only the missing bytes after resuming a photo`() = runTest {
        val api = mockk<TrailsApiService>()
        val photo = mockk<PhotoDto>()
        val bytes = ByteArray(BLOG_PHOTO_PART_BYTES * 2 + 17) { (it % 251).toByte() }
        val file = files.newFile().apply { writeBytes(bytes) }
        coEvery { api.blogPhotoUploadStatus(any(), any(), any(), any(), any(), any(), any()) } returns BlogPhotoUploadDto(1)
        coEvery { api.uploadBlogPhotoPart(any(), any(), any(), any(), any(), any(), 1, any(), any()) } coAnswers {
            val sink = Buffer()
            arg<RequestBody>(7).writeTo(sink)
            assertArrayEquals(bytes.copyOfRange(BLOG_PHOTO_PART_BYTES, BLOG_PHOTO_PART_BYTES * 2), sink.readByteArray())
            BlogPhotoUploadDto(2)
        }
        coEvery { api.uploadBlogPhotoPart(any(), any(), any(), any(), any(), any(), 2, any(), any()) } coAnswers {
            val sink = Buffer()
            arg<RequestBody>(7).writeTo(sink)
            assertArrayEquals(bytes.takeLast(17).toByteArray(), sink.readByteArray())
            BlogPhotoUploadDto(3, photo)
        }
        val progress = mutableListOf<Long>()
        val result = uploadBlogPhotoInParts(api, "entry", "upload", file, "sample.jpg", "image/jpeg") { progress.add(it) }
        assertEquals(photo, result)
        assertEquals(listOf(BLOG_PHOTO_PART_BYTES.toLong(), BLOG_PHOTO_PART_BYTES * 2L, bytes.size.toLong()), progress)
        coVerify(exactly = 0) { api.uploadBlogPhotoPart(any(), any(), any(), any(), any(), any(), 0, any(), any()) }
    }
}
