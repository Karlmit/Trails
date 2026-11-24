package com.trails.app.ui.blog

import android.net.Uri
import androidx.lifecycle.SavedStateHandle
import com.trails.app.data.DocumentsRepository
import com.trails.app.data.TimelineRepository
import com.trails.app.data.TripRepository
import com.trails.app.data.entity.TimelineEntryEntity
import com.trails.app.data.entity.PhotoEntity
import com.trails.app.network.dto.BlogPostRequest
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.coVerifyOrder
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.File
import java.net.SocketTimeoutException
import com.trails.app.R

@OptIn(ExperimentalCoroutinesApi::class)
class BlogEditViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    private val timeline = mockk<TimelineRepository>()
    private val documents = mockk<DocumentsRepository>()
    private val trips = mockk<TripRepository>()
    private val store = mockk<BlogDraftStore>()
    private var draft: DeviceBlogDraft? = null

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        every { trips.observeTrip("trip") } returns flowOf(null)
        coEvery { store.scopeFor("trip") } returns "scope"
        coEvery { store.load("scope", any()) } answers { draft }
        every { store.save("scope", any()) } answers {
            draft = secondArg()
            CompletableDeferred(Result.success(Unit))
        }
        coEvery { store.delete("scope", any()) } answers { draft = null }
        coEvery { store.deletePhoto("scope", any()) } returns Unit
        coEvery { documents.cacheStagedPhoto(any(), any()) } returns Unit
        coEvery { documents.resumeBlogPhoto(any(), any(), any(), any(), any(), any()) } returns null
    }

    @After
    fun tearDown() = Dispatchers.resetMain()

    @Test
    fun `compose offline then publish mixed blocks in editor order`() = runTest(dispatcher) {
        val editor = editor()
        runCurrent()
        val entry = serverEntry()
        val file = stageImage("lake.jpg")
        val saved = slot<BlogPostRequest>()
        coEvery { timeline.updateBlogPost("post", capture(saved), false) } returns entry
        coEvery { documents.uploadStagedPhoto("TIMELINE_ENTRY", "post", file, "lake.jpg", "image/jpeg", false, any()) } returns mockk {
            every { id } returns "lake"
        }
        coEvery { documents.importPhotoFromUrl("TIMELINE_ENTRY", "post", "https://example.com/peak.jpg", false, false) } returns mockk {
            every { id } returns "peak"
        }

        editor.onTitleChange("Trip")
        val first = editor.state.value.blocks.single().id
        editor.updateRuns(first, listOf(InlineRun("First", bold = true)))
        editor.addTextBlockAfter(first)
        val last = editor.state.value.blocks.last().id
        editor.updateRuns(last, listOf(InlineRun("Last")))
        editor.insertImages(listOf(pickedImage("lake.jpg")), { "lake.jpg" }, first)
        val lake = editor.state.first { !it.stagingImages }.blocks[1].id
        editor.insertImageFromUrl("https://example.com/peak.jpg", lake)
        val peak = editor.state.value.blocks[2].id
        editor.moveBlockBefore(last, first)
        editor.save()
        editor.state.first { !it.saving }

        coVerify(exactly = 0) { timeline.createBlogPost(any()) }
        coVerify(exactly = 0) { documents.uploadStagedPhoto(any(), any(), any(), any(), any(), any(), any()) }
        coVerify(exactly = 0) { documents.importPhotoFromUrl(any(), any(), any(), any(), any()) }
        assertEquals(listOf(last, first, lake, peak), draft?.blocks?.map { it.id })

        val reopened = editor()
        runCurrent()
        assertEquals(editor.state.value.blocks, reopened.state.value.blocks)
        reopened.publish()
        val result = reopened.state.first { !it.saving }
        assertTrue(result.saved)
        assertNull(draft)

        coVerifyOrder {
            timeline.createBlogPost(any())
            documents.uploadStagedPhoto(any(), any(), any(), any(), any(), any(), any())
            documents.importPhotoFromUrl(any(), any(), any(), any(), any())
            timeline.updateBlogPost("post", any(), false)
            timeline.publishBlogPost("post")
        }
        val blocks = parseEditableBlocks(saved.captured.description).blocks
        assertEquals(listOf(last, first, lake, peak), blocks.map { it.id })
        assertEquals(listOf("lake", "peak"), blocks.filterIsInstance<EditableBlock.Image>().map { it.photoId })
        assertEquals(listOf(InlineRun("First", bold = true)), (blocks[1] as EditableBlock.Text).runs)
    }

    @Test
    fun `failed publish retains the post and upload checkpoints across reopening`() = runTest(dispatcher) {
        val entry = serverEntry()
        val first = stageImage("first.jpg")
        val last = stageImage("last.jpg")
        coEvery { documents.uploadStagedPhoto("TIMELINE_ENTRY", "post", first, "first.jpg", "image/jpeg", false, any()) } returns mockk {
            every { id } returns "first-photo"
        }
        coEvery {
            documents.uploadStagedPhoto("TIMELINE_ENTRY", "post", last, "last.jpg", "image/jpeg", false, any())
        } throws SocketTimeoutException("slow connection") andThen mockk<PhotoEntity> { every { id } returns "last-photo" }
        coEvery { timeline.updateBlogPost("post", any(), false) } returns entry

        val editor = editor()
        runCurrent()
        editor.onTitleChange("Trip photos")
        editor.insertImages(listOf(pickedImage("first.jpg"), pickedImage("last.jpg")), { checkNotNull(it.lastPathSegment) })
        editor.state.first { !it.stagingImages }
        editor.publish()
        val error = editor.state.first { !it.saving }.error as BlogEditError.PublishFailure
        assertEquals(R.string.blog_publish_timeout, error.reasonRes)
        assertEquals("last.jpg", error.photoName)
        assertEquals("post", draft?.entryId)
        assertEquals(2, draft?.pendingPhotos?.size)
        assertEquals(listOf("first-photo"), draft?.pendingPhotos?.values?.mapNotNull { it.uploadedId })
        assertNotNull(draft)
        coVerify(exactly = 0) { timeline.publishBlogPost(any()) }

        val reopened = editor()
        runCurrent()
        reopened.publish()
        assertTrue(reopened.state.first { !it.saving }.saved)
        assertNull(draft)
        coVerify(exactly = 1) { timeline.createBlogPost(any()) }
        coVerify(exactly = 1) { documents.uploadStagedPhoto(any(), any(), first, any(), any(), any(), any()) }
        coVerify(exactly = 2) { documents.uploadStagedPhoto(any(), any(), last, any(), any(), any(), any()) }
        coVerify(exactly = 1) { timeline.publishBlogPost("post") }
    }

    private fun editor() = BlogEditViewModel(
        SavedStateHandle(mapOf("tripId" to "trip", "entryId" to "local-draft")), timeline, documents, trips, store,
    )

    private fun serverEntry(): TimelineEntryEntity = mockk<TimelineEntryEntity> {
        every { id } returns "post"
    }.also { entry ->
        coEvery { timeline.createBlogPost(any()) } returns entry
        coEvery { timeline.publishBlogPost("post") } returns entry
    }

    private fun stageImage(filename: String): File {
        val photo = DraftPhoto(filename, fileId = filename, mimeType = "image/jpeg")
        val file = File(filename)
        coEvery { store.stage("scope", any(), filename) } returns photo
        every { store.photoFile("scope", photo) } returns file
        every { store.photoFile("scope", match { it.sourceUrl != null }) } returns null
        return file
    }

    private fun pickedImage(name: String): Uri = mockk { every { lastPathSegment } returns name }
}
