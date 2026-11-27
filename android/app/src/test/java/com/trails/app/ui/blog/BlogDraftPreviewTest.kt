package com.trails.app.ui.blog

import com.trails.app.data.entity.PhotoEntity
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class BlogDraftPreviewTest {
    @get:Rule val files = TemporaryFolder()

    @Test
    fun `collage tiles and video resolve staged files by editable item id`() {
        val image = EditableBlock.Image(id = "tile", photoId = "pending-photo")
        val video = EditableBlock.Image(id = "video", photoId = "pending-video", isVideo = true)
        val stagedPhoto = DraftPhoto(filename = "photo.jpg", fileId = "photo-file", mimeType = "image/jpeg")
        val stagedVideo = DraftPhoto(filename = "clip.mp4", fileId = "clip-file", mimeType = "video/mp4")
        val photoFile = files.newFile("photo-file")
        val videoFile = files.newFile("clip-file")
        val localFiles = mapOf(stagedPhoto.fileId to photoFile, stagedVideo.fileId to videoFile)
        val blocks = listOf(EditableBlock.Collage("collage", listOf(image)), video)

        val media = blocks.flatMap(EditableBlock::photoItems).map {
            resolveBlogDraftMedia(it, mapOf(image.id to stagedPhoto, video.id to stagedVideo), emptyMap()) { photo ->
                localFiles[photo.fileId]
            }
        }

        assertEquals(listOf(photoFile, videoFile), media.map { it.file })
        assertEquals(listOf("image/jpeg", "video/mp4"), media.map { it.mimeType })
        assertEquals(listOf(null, null), media.map { it.serverPhotoId })
    }

    @Test
    fun `existing and previously uploaded draft media use the verified cache`() {
        val file = files.newFile("cached.mp4").apply { writeText("cached bytes") }
        val remote = PhotoEntity(
            id = "uploaded", tripId = "trip", ownerType = "TIMELINE_ENTRY", ownerId = "post",
            mimeType = "video/mp4", sizeBytes = file.length(), originalFilename = file.name,
            isPrimary = false, isPrivate = false, createdAt = "", localPath = file.absolutePath,
        )
        val remotePhotos = mapOf(remote.id to remote)
        val existing = EditableBlock.Image("existing", remote.id, isVideo = true)
        val pending = EditableBlock.Image("draft-video", "pending-video", isVideo = true)
        val uploaded = DraftPhoto(filename = file.name, uploadedId = remote.id)

        assertEquals(file, resolveBlogDraftMedia(existing, emptyMap(), remotePhotos) { null }.file)
        assertEquals(file, resolveBlogDraftMedia(pending, mapOf(pending.id to uploaded), remotePhotos) { null }.file)
        assertEquals(remote.id, resolveBlogDraftMedia(existing, emptyMap(), emptyMap()) { null }.serverPhotoId)
        assertEquals(remote.id, resolveBlogDraftMedia(pending, mapOf(pending.id to uploaded), emptyMap()) { null }.serverPhotoId)
        val invalidCache = mapOf(remote.id to remote.copy(sizeBytes = 1))
        assertNull(resolveBlogDraftMedia(existing, emptyMap(), invalidCache) { null }.file)
    }

    @Test
    fun `queued imports retain the placeholder without requiring an uploaded photo`() {
        val image = EditableBlock.Image("queued", "pending-photo")
        val queued = DraftPhoto(filename = "photo.jpg", sourceUrl = "https://example.com/photo.jpg")

        val media = resolveBlogDraftMedia(image, mapOf(image.id to queued), emptyMap()) { null }

        assertEquals(queued, media.staged)
        assertNull(media.file)
        assertNull(media.remote)
    }

    @Test
    fun `media between numbered paragraphs restarts reader numbering`() {
        val numbered = TextBlockKind.NUMBERED_LIST
        assertArrayEquals(intArrayOf(1, 2, 0, 1), blogListNumbers(listOf(numbered, numbered, null, numbered)))
    }
}
