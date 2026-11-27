package com.trails.app.ui.blog

import android.net.Uri
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModelStore
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
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
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

    private val background = mockk<BlogPublishCoordinator>()
    private var activeTask: BlogPublishTask? = null

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        every { background.active(any()) } answers { activeTask?.takeIf { it.key == firstArg<BlogPublishKey>() } }
        every { background.start(any()) } answers {
            val task = firstArg<BlogPublishTask>()
            activeTask = task
            CoroutineScope(Dispatchers.Main).launch {
                try {
                    BlogPublisher(timeline, documents, store).run(task)
                } finally {
                    activeTask = null
                }
            }
            true
        }
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

    @Test
    fun `collage survives offline reopening and retries each photo by its own stable id`() = runTest(dispatcher) {
        val entry = serverEntry()
        val first = stageImage("collage-first.jpg")
        val last = stageImage("collage-last.jpg")
        val saved = slot<BlogPostRequest>()
        coEvery { timeline.updateBlogPost("post", capture(saved), false) } returns entry
        coEvery {
            documents.uploadStagedPhoto("TIMELINE_ENTRY", "post", first, "collage-first.jpg", "image/jpeg", false, any())
        } returns mockk { every { id } returns "first-photo" }
        coEvery {
            documents.uploadStagedPhoto("TIMELINE_ENTRY", "post", last, "collage-last.jpg", "image/jpeg", false, any())
        } throws SocketTimeoutException("slow connection") andThen mockk<PhotoEntity> { every { id } returns "last-photo" }

        val original = editor()
        runCurrent()
        original.onTitleChange("Photo wall")
        val text = original.state.value.blocks.single().id
        original.addCollageAfter(text)
        val collageId = original.state.value.blocks.last().id
        original.insertCollagePhotos(collageId, listOf(pickedImage("collage-first.jpg"), pickedImage("collage-last.jpg"))) {
            checkNotNull(it.lastPathSegment)
        }
        val beforeSave = original.state.first { !it.stagingImages }.blocks.last() as EditableBlock.Collage
        original.moveBlockBefore(collageId, text)
        original.save()
        assertTrue(original.state.first { !it.saving }.saved)
        assertEquals(listOf(collageId, text), draft?.blocks?.map { it.id })
        coVerify(exactly = 0) { timeline.createBlogPost(any()) }

        val reopened = editor()
        runCurrent()
        assertEquals(beforeSave, reopened.state.value.blocks.first())
        reopened.publish()
        val failure = reopened.state.first { !it.saving }.error as BlogEditError.PublishFailure
        assertEquals("collage-last.jpg", failure.photoName)
        val firstId = beforeSave.photos.first().id
        val lastId = beforeSave.photos.last().id
        assertEquals("first-photo", draft?.pendingPhotos?.get(firstId)?.uploadedId)
        assertNull(draft?.pendingPhotos?.get(lastId)?.uploadedId)

        val retry = editor()
        runCurrent()
        retry.publish()
        assertTrue(retry.state.first { !it.saving }.saved)
        assertEquals(
            beforeSave.copy(photos = listOf(beforeSave.photos[0].copy(photoId = "first-photo"), beforeSave.photos[1].copy(photoId = "last-photo"))),
            parseEditableBlocks(saved.captured.description).blocks.first(),
        )
        coVerify(exactly = 1) { documents.resumeBlogPhoto("post", firstId, first, any(), any(), any()) }
        coVerify(exactly = 2) { documents.resumeBlogPhoto("post", lastId, last, any(), any(), any()) }
        coVerify(exactly = 1) { documents.uploadStagedPhoto(any(), any(), first, any(), any(), any(), any()) }
        coVerify(exactly = 2) { documents.uploadStagedPhoto(any(), any(), last, any(), any(), any(), any()) }
    }

    @Test
    fun `collage caps picker additions and removes pending photos individually or with the block`() = runTest(dispatcher) {
        val editor = editor()
        runCurrent()
        editor.addCollageAfter(editor.state.value.blocks.single().id)
        val collageId = editor.state.value.blocks.last().id
        val names = (0..MAX_COLLAGE_PHOTOS + 1).map { "tile-$it.jpg" }
        names.take(MAX_COLLAGE_PHOTOS).forEach(::stageImage)
        editor.insertCollagePhotos(collageId, names.map(::pickedImage)) { checkNotNull(it.lastPathSegment) }
        val full = editor.state.first { !it.stagingImages }
        val collage = full.blocks.last() as EditableBlock.Collage
        assertEquals(names.take(MAX_COLLAGE_PHOTOS), collage.photos.map { full.pendingPhotos[it.id]?.filename })
        assertEquals(names.size - MAX_COLLAGE_PHOTOS, (full.error as BlogEditError.ImageBatch).skippedForCapacity)
        coVerify(exactly = MAX_COLLAGE_PHOTOS) { store.stage("scope", any(), any()) }

        editor.removeCollagePhoto(collageId, collage.photos.first().id)
        assertEquals(collage.photos.drop(1), (editor.state.value.blocks.last() as EditableBlock.Collage).photos)
        editor.removeBlock(collageId)
        runCurrent()
        assertTrue(editor.state.value.pendingPhotos.isEmpty())
        assertTrue(draft?.pendingPhotos?.isEmpty() == true)
        coVerify(exactly = MAX_COLLAGE_PHOTOS) { store.deletePhoto("scope", any()) }
    }

    @Test
    fun `invalid picker results leave room for later valid collage photos`() = runTest(dispatcher) {
        val editor = editor()
        runCurrent()
        editor.addCollageAfter(editor.state.value.blocks.single().id)
        val collageId = editor.state.value.blocks.last().id
        val names = (1..MAX_COLLAGE_PHOTOS).map { "valid-$it.jpg" }
        names.forEach(::stageImage)
        val video = DraftPhoto("clip.mp4", fileId = "clip", mimeType = "video/mp4")
        coEvery { store.stage("scope", any(), "clip.mp4") } returns video
        val selections = listOf("clip.mp4") + names + "excess.jpg"

        editor.insertCollagePhotos(collageId, selections.map(::pickedImage)) { checkNotNull(it.lastPathSegment) }
        val result = editor.state.first { !it.stagingImages }
        val collage = result.blocks.last() as EditableBlock.Collage
        assertEquals(names, collage.photos.map { result.pendingPhotos.getValue(it.id).filename })
        assertEquals(BlogEditError.ImageBatch(listOf(ImageUploadFailure("clip.mp4", null)), 1), result.error)
        coVerify(exactly = 1) { store.deletePhoto("scope", video) }
        coVerify(exactly = 0) { store.stage("scope", any(), "excess.jpg") }
    }

    @Test
    fun `publishing survives clearing the editor and a new editor observes completion`() = runTest(dispatcher) {
        val remote = serverEntry()
        val finish = CompletableDeferred<TimelineEntryEntity>()
        coEvery { timeline.updateBlogPost("post", any(), false) } returns remote
        coEvery { timeline.publishBlogPost("post") } coAnswers { finish.await() }

        val original = editor()
        val owner = ViewModelStore().apply { put("editor", original) }
        runCurrent()
        original.onTitleChange("On the road")
        original.publish()
        runCurrent()
        owner.clear()

        val reopened = editor()
        runCurrent()
        assertTrue(reopened.state.value.publishing)
        reopened.publish()
        finish.complete(remote)
        runCurrent()

        assertTrue(reopened.state.value.saved)
        coVerify(exactly = 1) { timeline.publishBlogPost("post") }
        assertNull(draft)
    }

    private fun editor() = BlogEditViewModel(
        SavedStateHandle(mapOf("tripId" to "trip", "entryId" to "local-draft")), timeline, documents, trips, store, background,
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
