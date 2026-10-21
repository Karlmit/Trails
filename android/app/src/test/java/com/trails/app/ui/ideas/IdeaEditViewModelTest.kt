package com.trails.app.ui.ideas

import androidx.lifecycle.SavedStateHandle
import com.trails.app.data.DocumentsRepository
import com.trails.app.data.IdeaCategoryStore
import com.trails.app.data.IdeaRepository
import com.trails.app.data.LinksTagsRepository
import com.trails.app.data.TimelineRepository
import com.trails.app.data.entity.IdeaEntity
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class IdeaEditViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    private val repository = mockk<IdeaRepository>()
    private val links = mockk<LinksTagsRepository>(relaxed = true)
    private val documents = mockk<DocumentsRepository>()
    private val categories = mockk<IdeaCategoryStore>()
    private val timeline = mockk<TimelineRepository>()

    @Before fun setUp() {
        Dispatchers.setMain(dispatcher)
        every { repository.observeForTrip("trip") } returns flowOf(emptyList())
        every { documents.observePhotosForOwner(any(), any()) } returns flowOf(emptyList())
        every { categories.observe("trip") } returns flowOf(emptySet())
    }

    @After fun tearDown() { Dispatchers.resetMain() }

    @Test
    fun `existing idea is not ready until loaded and duplicate in-flight saves are ignored`() = runTest(dispatcher) {
        val idea = idea()
        val result = CompletableDeferred<IdeaEntity>()
        coEvery { repository.update(idea.id, any()) } coAnswers { result.await() }
        val viewModel = IdeaEditViewModel(
            SavedStateHandle(mapOf("tripId" to "trip", "ideaId" to idea.id)),
            repository, links, documents, categories, timeline,
        )

        assertFalse(viewModel.state.value.initialized)
        viewModel.save()
        coVerify(exactly = 0) { repository.update(any(), any()) }

        viewModel.loadIfEditing(listOf(idea))
        assertTrue(viewModel.state.value.initialized)
        viewModel.save()
        viewModel.save()
        runCurrent()
        coVerify(exactly = 1) { repository.update(idea.id, any()) }
        result.complete(idea)
        runCurrent()
        assertFalse(viewModel.state.value.saving)
    }

    private fun idea() = IdeaEntity(
        id = "idea", tripId = "trip", sectionId = null, title = "Loaded title", category = null,
        description = null, priority = "MAYBE", weatherSuitability = "EITHER", locationName = null,
        locationAddress = null, locationLat = null, locationLng = null, locationMapLink = null,
        estimatedExpenseAmount = null, estimatedExpenseCurrency = null,
        createdAt = "2026-01-01T00:00:00Z", updatedAt = "2026-01-01T00:00:00Z",
    )
}
