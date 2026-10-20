package com.trails.app.data

import com.trails.app.data.dao.AttachmentDao
import com.trails.app.data.dao.PhotoDao
import com.trails.app.data.entity.PhotoEntity
import com.trails.app.network.TrailsApiService
import com.trails.app.network.dto.PhotoDto
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import org.junit.Assert.fail
import org.junit.Test
import java.io.File

class DocumentsRepositoryTest {
    private val api = mockk<TrailsApiService>()
    private val attachments = mockk<AttachmentDao>(relaxed = true)
    private val photos = mockk<PhotoDao>(relaxed = true)
    private val files = mockk<FileCacheManager>()
    private val repository = DocumentsRepository(api, attachments, photos, files)

    @Test
    fun `photo metadata still syncs when attachment metadata fails`() = runTest {
        coEvery { api.listAttachments("trip") } throws IllegalStateException("attachments failed")
        coEvery { api.listPhotos("trip") } returns listOf(photoDto())
        coEvery { photos.getAllForTrip("trip") } returnsMany listOf(emptyList(), emptyList())
        coEvery { attachments.getAllForTrip("trip") } returns emptyList()

        try {
            repository.syncTrip("trip")
            fail("Expected attachment metadata failure to propagate")
        } catch (_: IllegalStateException) {
            // expected
        }

        coVerify(exactly = 1) { api.listPhotos("trip") }
        coVerify(exactly = 1) { photos.upsertAll(match { it.single().id == "photo" }) }
    }

    @Test
    fun `invalid photo path is cleared before same-path repair`() = runTest {
        val stale = File.createTempFile("stale-photo", ".jpg").apply { writeBytes(byteArrayOf(1)) }
        val photo = photoEntity(localPath = stale.absolutePath, sizeBytes = 2)
        coEvery { files.downloadPhoto(photo) } answers {
            stale.writeBytes(byteArrayOf(1, 2))
            stale.absolutePath
        }

        repository.ensurePhotoCached(photo)

        coVerify(ordering = io.mockk.Ordering.ORDERED) {
            photos.setLocalPath("photo", null)
            photos.setLocalPath("photo", stale.absolutePath)
        }
        stale.delete()
    }

    private fun photoDto() = PhotoDto(
        id = "photo", tripId = "trip", ownerType = "IDEA", ownerId = "idea",
        mimeType = "image/jpeg", sizeBytes = 2, originalFilename = "cover.jpg", createdAt = "2026-01-01",
    )

    private fun photoEntity(localPath: String?, sizeBytes: Int) = PhotoEntity(
        id = "photo", tripId = "trip", ownerType = "IDEA", ownerId = "idea",
        mimeType = "image/jpeg", sizeBytes = sizeBytes, originalFilename = "cover.jpg",
        isPrimary = true, isPrivate = false, createdAt = "2026-01-01", localPath = localPath,
    )
}
