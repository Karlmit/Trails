package com.trails.app.ui.importantinfo

import androidx.lifecycle.SavedStateHandle
import com.trails.app.R
import com.trails.app.data.DocumentsRepository
import com.trails.app.data.ImportantInfoRepository
import com.trails.app.data.LinksTagsRepository
import com.trails.app.data.entity.AttachmentEntity
import com.trails.app.network.dto.LinkDto
import io.mockk.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

class ImportantInfoDetailViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    private val repository = mockk<ImportantInfoRepository>()
    private val links = mockk<LinksTagsRepository>(relaxed = true)
    private val documents = mockk<DocumentsRepository>()
    @Before fun setup() {
        Dispatchers.setMain(dispatcher)
        every { repository.observeForTrip("trip") } returns flowOf(emptyList())
        every { documents.observePhotosForOwner(any(), any()) } returns flowOf(emptyList())
        every { documents.observeAttachmentsForOwner(any(), any()) } returns flowOf(emptyList())
    }
    @After fun cleanup() { Dispatchers.resetMain() }
    private fun model() = ImportantInfoDetailViewModel(
        SavedStateHandle(mapOf("tripId" to "trip", "infoId" to "info")), repository, links, documents,
    )

    @Test fun `resume refresh fetches links again after editing`() = runTest(dispatcher) {
        val first = mockk<LinkDto>()
        val updated = mockk<LinkDto>()
        coEvery { links.listLinks("IMPORTANT_INFO", "info") } returnsMany listOf(listOf(first), listOf(updated))
        val model = model()
        model.refreshExtras()
        runCurrent()
        assertEquals(listOf(first), model.links.value)
        model.refreshExtras()
        runCurrent()
        assertEquals(listOf(updated), model.links.value)
    }

    @Test fun `failed attachment cache shows feedback and does not open a file`() = runTest(dispatcher) {
        val attachment = mockk<AttachmentEntity>()
        coEvery { documents.ensureAttachmentCached(attachment) } returns null
        val model = model()
        var opened = false
        model.openAttachment(attachment) { opened = true }
        runCurrent()
        assertFalse(opened)
        assertEquals(R.string.document_open_failed, model.errorRes.value)
    }
}
