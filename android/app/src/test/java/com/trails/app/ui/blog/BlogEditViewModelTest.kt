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

    @Test
    fun `photos insert between paragraphs and mixed blocks save in reordered order`() = runTest(dispatcher) {
        val entry = mockk<TimelineEntryEntity> { every { id } returns "post" }
        every { trips.observeTrip("trip") } returns flowOf(null)
        coEvery { timeline.createBlogPost(any()) } returns entry
        val uri = pickedImage("lake.jpg")
        coEvery { documents.uploadPhoto("TIMELINE_ENTRY", "post", uri, "lake.jpg") } returns mockk {
            every { id } returns "lake"
        }
        coEvery { documents.importPhotoFromUrl("TIMELINE_ENTRY", "post", "https://example.com/peak.jpg") } returns mockk {
            every { id } returns "peak"
        }
        val saved = slot<BlogPostRequest>()
        coEvery { timeline.updateBlogPost("post", capture(saved)) } returns entry
        val editor = BlogEditViewModel(SavedStateHandle(mapOf("tripId" to "trip")), timeline, documents, trips)
        editor.onTitleChange("Trip")
        val first = editor.state.value.blocks.single().id
        editor.updateRuns(first, listOf(InlineRun("First", bold = true)))
        editor.addTextBlockAfter(first)
        val last = editor.state.value.blocks.last().id
        editor.updateRuns(last, listOf(InlineRun("Last")))

        editor.insertImages(listOf(uri), { "lake.jpg" }, "Untitled", first)
        val afterUpload = editor.state.first { !it.uploadingImage }.blocks
        val lake = (afterUpload[1] as EditableBlock.Image).id
        assertEquals(listOf(first, lake, last), afterUpload.map { it.id })

        editor.addTextBlockAfter(lake)
        val middle = editor.state.value.blocks[2].id
        editor.updateRuns(middle, listOf(InlineRun("Middle")))
        editor.insertImageFromUrl("https://example.com/peak.jpg", "Untitled", lake)
        val afterImport = editor.state.first { !it.uploadingImage }.blocks
        val peak = (afterImport[2] as EditableBlock.Image).id
        assertEquals(listOf(first, lake, peak, middle, last), afterImport.map { it.id })

        editor.moveBlockBefore(last, first)
        editor.moveBlockBefore(lake, null)
        val reordered = editor.state.value.blocks
        assertEquals(listOf(last, first, peak, middle, lake), reordered.map { it.id })
        editor.save("Untitled")
        editor.state.first { !it.saving }
        assertEquals(reordered, parseEditableBlocks(saved.captured.description).blocks)
    }

    private fun pickedImage(name: String): Uri = mockk {
        every { lastPathSegment } returns name
    }
}
