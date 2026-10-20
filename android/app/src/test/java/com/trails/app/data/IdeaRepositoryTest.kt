package com.trails.app.data

import com.trails.app.data.dao.IdeaDao
import com.trails.app.data.dao.TimelineEntryDao
import com.trails.app.network.TrailsApiService
import com.trails.app.network.dto.IdeaDto
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import org.junit.Test
import java.io.IOException

class IdeaRepositoryTest {
    private val api = mockk<TrailsApiService>()
    private val ideas = mockk<IdeaDao>(relaxed = true)
    private val entries = mockk<TimelineEntryDao>(relaxed = true)
    private val repository = IdeaRepository(api, ideas, entries)

    @Test
    fun `web-created idea is persisted from a complete response`() = runTest {
        coEvery { api.listIdeas("trip") } returns listOf(ideaDto())

        repository.syncTrip("trip")

        coVerify(exactly = 1) { ideas.upsertAll(match { it.single().id == "web-idea" }) }
        coVerify(exactly = 1) { ideas.deleteMissing("trip", listOf("web-idea")) }
    }

    @Test
    fun `cached ideas are untouched when request fails`() = runTest {
        coEvery { api.listIdeas("trip") } throws IOException("offline")

        runCatching { repository.syncTrip("trip") }

        coVerify(exactly = 0) { ideas.upsertAll(any()) }
        coVerify(exactly = 0) { ideas.deleteMissing(any(), any()) }
        coVerify(exactly = 0) { ideas.deleteAllForTrip(any()) }
    }

    private fun ideaDto() = IdeaDto(
        id = "web-idea",
        tripId = "trip",
        title = "New from web",
        priority = "MAYBE",
        weatherSuitability = "EITHER",
        createdAt = "2026-10-20T10:00:00Z",
        updatedAt = "2026-10-20T10:00:00Z",
    )
}
