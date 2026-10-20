package com.trails.app.ui.ideas

import com.trails.app.data.isUsablePhotoCache
import com.trails.app.data.entity.IdeaEntity
import com.trails.app.data.entity.PhotoEntity
import com.trails.app.data.entity.SectionEntity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlinx.coroutines.test.runTest

class IdeasViewModelTest {
    @Test
    fun `primary photo wins over newer fallback`() {
        val idea = idea("idea-1")
        val newer = photo(id = "newer", ownerId = idea.id, createdAt = "2026-10-20T10:00:00Z")
        val primary = photo(id = "primary", ownerId = idea.id, isPrimary = true, createdAt = "2026-10-19T10:00:00Z")

        assertEquals(primary, ideaCoverPhotos(listOf(idea), listOf(newer, primary))[idea.id])
    }

    @Test
    fun `newest photo is fallback when no primary exists`() {
        val idea = idea("idea-1")
        val newer = photo(id = "newer", ownerId = idea.id, createdAt = "2026-10-20T10:00:00Z")
        val older = photo(id = "older", ownerId = idea.id, createdAt = "2026-10-19T10:00:00Z")

        assertEquals(newer, ideaCoverPhotos(listOf(idea), listOf(older, newer))[idea.id])
    }

    @Test
    fun `photos for other owner types or unknown ideas are excluded`() {
        val idea = idea("idea-1")
        val entryPhoto = photo(id = "entry", ownerId = idea.id, ownerType = "TIMELINE_ENTRY")
        val unknownIdeaPhoto = photo(id = "unknown", ownerId = "idea-2")

        assertTrue(ideaCoverPhotos(listOf(idea), listOf(entryPhoto, unknownIdeaPhoto)).isEmpty())
    }

    @Test
    fun `all selected covers are checked so stale paths can be repaired`() = runTest {
        val firstIdea = idea("idea-1")
        val secondIdea = idea("idea-2")
        val firstCover = photo(id = "first-cover", ownerId = firstIdea.id, isPrimary = true)
        val firstExtra = photo(id = "first-extra", ownerId = firstIdea.id)
        val cachedCover = photo(id = "cached-cover", ownerId = secondIdea.id, localPath = "/photos/cached.jpg")
        val cached = mutableListOf<PhotoEntity>()

        ensureIdeaCoversCached(
            ideas = listOf(firstIdea, secondIdea),
            photos = listOf(firstExtra, firstCover, cachedCover),
            cachePhoto = cached::add,
        )

        assertEquals(listOf(firstCover, cachedCover), cached)
    }

    @Test
    fun `idea with unknown section remains in unsectioned group`() {
        val unassigned = idea("idea-1")
        val temporarilyUnknown = idea("idea-2", sectionId = "section-missing")
        val assigned = idea("idea-3", sectionId = "section-known")

        assertEquals(
            listOf(unassigned, temporarilyUnknown),
            ideasWithoutKnownSection(listOf(unassigned, temporarilyUnknown, assigned), listOf(section("section-known"))),
        )
    }

    @Test
    fun `photo cache is usable only when file exists at expected size`() {
        val cached = kotlin.io.path.createTempFile(suffix = ".jpg").toFile()
        cached.writeBytes(byteArrayOf(1, 2, 3))
        val photo = photo(id = "cover", ownerId = "idea-1", localPath = cached.absolutePath, sizeBytes = 3)

        assertTrue(isUsablePhotoCache(photo))
        cached.writeBytes(byteArrayOf(1, 2))
        assertFalse(isUsablePhotoCache(photo))
        cached.delete()
        assertFalse(isUsablePhotoCache(photo))
    }

    private fun idea(id: String, sectionId: String? = null) = IdeaEntity(
        id = id,
        tripId = "trip-1",
        sectionId = sectionId,
        title = "Idea",
        priority = "MAYBE",
        weatherSuitability = "EITHER",
        category = null,
        description = null,
        locationName = null,
        locationAddress = null,
        locationLat = null,
        locationLng = null,
        locationMapLink = null,
        estimatedExpenseAmount = null,
        estimatedExpenseCurrency = null,
        createdAt = "2026-10-19T09:00:00Z",
        updatedAt = "2026-10-19T09:00:00Z",
    )

    private fun section(id: String) = SectionEntity(
        id = id,
        tripId = "trip-1",
        name = "Section",
        startDate = "2026-10-20",
        endDate = "2026-10-21",
        color = null,
        emoji = null,
        createdAt = "2026-10-19T09:00:00Z",
        updatedAt = "2026-10-19T09:00:00Z",
    )

    private fun photo(
        id: String,
        ownerId: String,
        ownerType: String = "IDEA",
        isPrimary: Boolean = false,
        createdAt: String = "2026-10-20T10:00:00Z",
        localPath: String? = null,
        sizeBytes: Int = 100,
    ) = PhotoEntity(
        id = id,
        tripId = "trip-1",
        ownerType = ownerType,
        ownerId = ownerId,
        mimeType = "image/jpeg",
        sizeBytes = sizeBytes,
        originalFilename = "$id.jpg",
        isPrimary = isPrimary,
        isPrivate = false,
        createdAt = createdAt,
        localPath = localPath,
    )
}
