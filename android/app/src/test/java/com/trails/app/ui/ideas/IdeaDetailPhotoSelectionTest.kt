package com.trails.app.ui.ideas

import android.content.Context
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.test.core.app.ApplicationProvider
import com.trails.app.R
import com.trails.app.data.entity.PhotoEntity
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.Rule
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class IdeaDetailPhotoSelectionTest {
    @get:Rule val composeRule = createComposeRule()
    private val context = ApplicationProvider.getApplicationContext<Context>()

    @Test
    fun `usable primary is hero and is excluded from additional photos`() {
        val primary = photo("primary", primary = true, createdAt = "2026-01-01T00:00:00Z")
        val extra = photo("extra", createdAt = "2026-01-02T00:00:00Z")

        val result = selectIdeaDetailPhotos(listOf(extra, primary))

        assertEquals(primary.id, result.cover?.id)
        assertEquals(listOf(extra.id), result.additional.map { it.id })
    }

    @Test
    fun `newest usable photo replaces unusable primary as hero`() {
        val missingPrimary = photo("primary", primary = true, usable = false)
        val older = photo("older", createdAt = "2026-01-01T00:00:00Z")
        val newest = photo("newest", createdAt = "2026-01-03T00:00:00Z")

        val result = selectIdeaDetailPhotos(listOf(missingPrimary, older, newest))

        assertEquals(newest.id, result.cover?.id)
        assertEquals(listOf(older.id), result.additional.map { it.id })
    }

    @Test
    fun `no usable image collapses hero and gallery`() {
        val result = selectIdeaDetailPhotos(listOf(photo("missing", usable = false)))

        assertNull(result.cover)
        assertTrue(result.additional.isEmpty())
    }

    @Test
    fun `single usable cover does not create duplicate gallery`() {
        val result = selectIdeaDetailPhotos(listOf(photo("only")))

        assertEquals("only", result.cover?.id)
        assertTrue(result.additional.isEmpty())
    }

    @Test
    fun `actual hero and gallery content follow selected photo contract`() {
        val cover = photo("cover", primary = true)
        val extra = photo("extra")
        val selected = selectIdeaDetailPhotos(listOf(extra, cover))

        composeRule.setContent { MaterialTheme { IdeaHero(selected.cover); IdeaGallery(selected.additional) } }

        composeRule.onNodeWithTag("idea-hero").assertIsDisplayed()
        composeRule.onNodeWithTag("idea-gallery").assertIsDisplayed()
        composeRule.onNodeWithText(context.getString(R.string.idea_detail_photos_heading)).assertIsDisplayed()
    }

    @Test
    fun `actual content emits neither hero nor gallery without usable photos`() {
        val selected = selectIdeaDetailPhotos(listOf(photo("missing", usable = false)))

        composeRule.setContent { MaterialTheme { IdeaHero(selected.cover); IdeaGallery(selected.additional) } }

        assertTrue(composeRule.onAllNodesWithTag("idea-hero").fetchSemanticsNodes().isEmpty())
        assertTrue(composeRule.onAllNodesWithTag("idea-gallery").fetchSemanticsNodes().isEmpty())
    }

    private fun photo(
        id: String,
        primary: Boolean = false,
        createdAt: String = "2026-01-02T00:00:00Z",
        usable: Boolean = true,
    ): PhotoEntity {
        val file = if (usable) File.createTempFile(id, ".jpg").apply { writeBytes(byteArrayOf(1)) } else File("/missing/$id.jpg")
        return PhotoEntity(
            id = id, tripId = "trip", ownerType = "IDEA", ownerId = "idea",
            mimeType = "image/jpeg", sizeBytes = 1, originalFilename = "$id.jpg",
            isPrimary = primary, isPrivate = false, createdAt = createdAt, localPath = file.absolutePath,
        )
    }
}
