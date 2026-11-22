package com.trails.app.ui.blog

import android.net.Uri
import androidx.lifecycle.SavedStateHandle
import com.trails.app.data.DocumentsRepository
import com.trails.app.data.TimelineRepository
import com.trails.app.data.TripRepository
import com.trails.app.data.entity.TimelineEntryEntity
import com.trails.app.network.dto.BlogPostRequest
import io.mockk.coEvery
import io.mockk.coVerifyOrder
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import java.io.IOException

class BlogEditViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    private val timeline = mockk<TimelineRepository>()
    private val documents = mockk<DocumentsRepository>()
    private val trips = mockk<TripRepository>()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `publishing saves successful images in selection order after a partial upload failure`() = runTest(dispatcher) {
        val first = pickedImage("first.jpg")
        val missing = pickedImage("missing.jpg")
        val last = pickedImage("last.jpg")
        val entry = mockk<TimelineEntryEntity> {
            every { id } returns "post"
        }
        every { trips.observeTrip("trip") } returns flowOf(null)
        coEvery { timeline.createBlogPost(any()) } returns entry
        coEvery { documents.uploadPhoto("TIMELINE_ENTRY", "post", first, "first.jpg") } returns mockk {
            every { id } returns "first-photo"
        }
        coEvery { documents.uploadPhoto("TIMELINE_ENTRY", "post", missing, "missing.jpg") } throws IOException()
        coEvery { documents.uploadPhoto("TIMELINE_ENTRY", "post", last, "last.jpg") } returns mockk {
            every { id } returns "last-photo"
        }
        val savedRequest = slot<BlogPostRequest>()
        coEvery { timeline.updateBlogPost("post", capture(savedRequest)) } returns entry
        coEvery { timeline.publishBlogPost("post") } returns entry
        val editor = BlogEditViewModel(SavedStateHandle(mapOf("tripId" to "trip")), timeline, documents, trips)

        editor.onTitleChange("Trip photos")
        editor.insertImages(listOf(first, missing, last), { checkNotNull(it.lastPathSegment) }, "Untitled")
        val uploaded = editor.state.first { !it.uploadingImage }
        val failures = (uploaded.error as BlogEditError.ImageBatch).failures
        assertEquals(listOf("missing.jpg"), failures.map { it.filename })
        editor.publish("Untitled")
        editor.state.first { !it.saving }

        coVerifyOrder {
            timeline.createBlogPost(any())
            timeline.updateBlogPost("post", any())
            timeline.publishBlogPost("post")
        }
        val images = parseEditableBlocks(savedRequest.captured.description).blocks.filterIsInstance<EditableBlock.Image>()
        assertEquals(listOf("first-photo", "last-photo"), images.map { it.photoId })
    }

    private fun pickedImage(name: String): Uri = mockk {
        every { lastPathSegment } returns name
    }
}
