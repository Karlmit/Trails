package com.trails.app.ui.blog

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModelStore
import com.trails.app.data.DocumentsRepository
import com.trails.app.data.TimelineRepository
import com.trails.app.data.entity.PhotoEntity
import com.trails.app.data.entity.TimelineEntryEntity
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.Assert.assertEquals
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class BlogDetailCacheTest {
    @Test
    fun `detail ensures large and stale collage photos are cached without expanding ordinary prefetch`() {
        val dispatcher = StandardTestDispatcher()
        Dispatchers.setMain(dispatcher)
        try {
            runTest(dispatcher) {
                val large = photo("large", 30L * 1024 * 1024)
                val stale = photo("stale", 12, "/photos/stale.jpg")
                val standalone = photo("standalone", large.sizeBytes)
                val cachedStandalone = photo("cached", 12, "/photos/cached.jpg")
                val entry = mockk<TimelineEntryEntity> {
                    every { description } returns encodeEditableBlocks(listOf(
                        EditableBlock.Image("ordinary", standalone.id),
                        EditableBlock.Image("cached", cachedStandalone.id),
                        EditableBlock.Collage("collage", listOf(EditableBlock.Image("tile1", large.id), EditableBlock.Image("tile2", stale.id))),
                    ))
                }
                val timeline = mockk<TimelineRepository> { every { observeEntry("post") } returns flowOf(entry) }
                val documents = mockk<DocumentsRepository> {
                    every { observePhotosForOwner("TIMELINE_ENTRY", "post") } returns flowOf(listOf(large, stale, standalone, cachedStandalone))
                    coEvery { ensurePhotoCached(large) } returns "/photos/large.jpg"
                    coEvery { ensurePhotoCached(stale) } returns stale.localPath
                }
                val viewModel = BlogDetailViewModel(SavedStateHandle(mapOf("entryId" to "post")), timeline, documents, mockk(), mockk())
                val store = ViewModelStore().apply { put("detail", viewModel) }
                try {
                    backgroundScope.launch { viewModel.uiState.collect {} }
                    val paths = viewModel.collagePhotoPaths.first { it.size == 2 }
                    assertEquals(mapOf("large" to "/photos/large.jpg", "stale" to stale.localPath), paths)
                    coVerify(exactly = 0) { documents.ensurePhotoCached(standalone) }
                    coVerify(exactly = 0) { documents.ensurePhotoCached(cachedStandalone) }
                } finally {
                    store.clear()
                }
            }
        } finally {
            Dispatchers.resetMain()
        }
    }

    private fun photo(id: String, bytes: Long, localPath: String? = null) = PhotoEntity(
        id, "trip", "TIMELINE_ENTRY", "post", "image/jpeg", bytes, "$id.jpg",
        isPrimary = false, isPrivate = false, createdAt = "", localPath = localPath,
    )
}
