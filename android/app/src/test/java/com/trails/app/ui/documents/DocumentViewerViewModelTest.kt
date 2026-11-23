package com.trails.app.ui.documents

import androidx.lifecycle.SavedStateHandle
import com.trails.app.data.DocumentsRepository
import com.trails.app.data.entity.AttachmentEntity
import com.trails.app.data.entity.PhotoEntity
import com.trails.app.ui.nav.ARG_ATTACHMENT_ID
import com.trails.app.ui.nav.ARG_VIEW_PHOTO
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

class DocumentViewerViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    private val repository = mockk<DocumentsRepository>()

    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    @Test fun `failed download can be retried from the viewer`() = runTest(dispatcher) {
        val attachment = mockk<AttachmentEntity> {
            every { localPath } returns "/cache/ticket.pdf"
            every { mimeType } returns "application/pdf"
            every { originalFilename } returns "ticket.pdf"
        }
        coEvery { repository.attachmentForPreview("file") } returnsMany listOf(null, attachment)

        val viewer = DocumentViewerViewModel(SavedStateHandle(mapOf(ARG_ATTACHMENT_ID to "file")), repository)
        runCurrent()
        assertEquals(DocumentViewerState.Error, viewer.state.value)

        viewer.retry()
        assertEquals(DocumentViewerState.Loading, viewer.state.value)
        runCurrent()
        assertEquals(DocumentViewerState.Ready("/cache/ticket.pdf", "application/pdf", "ticket.pdf"), viewer.state.value)
    }

    @Test fun `saved photos resolve through the photo cache`() = runTest(dispatcher) {
        val photo = mockk<PhotoEntity> {
            every { localPath } returns "/cache/photo.jpg"
            every { mimeType } returns "image/jpeg"
            every { originalFilename } returns "photo.jpg"
        }
        coEvery { repository.photoForPreview("file") } returns photo

        val arguments = SavedStateHandle(mapOf(ARG_ATTACHMENT_ID to "file", ARG_VIEW_PHOTO to true))
        val viewer = DocumentViewerViewModel(arguments, repository)
        runCurrent()
        assertEquals(DocumentViewerState.Ready("/cache/photo.jpg", "image/jpeg", "photo.jpg"), viewer.state.value)
    }
}
