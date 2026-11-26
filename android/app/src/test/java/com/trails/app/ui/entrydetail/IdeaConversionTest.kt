package com.trails.app.ui.entrydetail

import androidx.lifecycle.SavedStateHandle
import com.trails.app.data.IdeaRepository
import com.trails.app.data.LinksTagsRepository
import com.trails.app.data.TimelineRepository
import com.trails.app.data.entity.IdeaEntity
import com.trails.app.data.entity.TimelineEntryEntity
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class IdeaConversionTest {
    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    @Test fun `converts only after confirming an event date and sends the event fields`() = runTest(dispatcher) {
        val ideas = mockk<IdeaRepository>()
        val timeline = mockk<TimelineRepository>()
        val links = mockk<LinksTagsRepository>(relaxed = true)
        val idea = IdeaEntity(
            "idea", "trip", null, "Visit museum", null, "A rainy day plan", "MAYBE", "EITHER",
            "City Museum", null, null, null, null, 20.0, "EUR", "", "",
        )
        val body = slot<JsonObject>()
        every { ideas.observeForTrip("trip") } returns flowOf(listOf(idea))
        coEvery { ideas.convertToEntry("idea", capture(body)) } returns mockk<TimelineEntryEntity> {
            every { id } returns "event"
        }
        val editor = EntryEditViewModel(
            SavedStateHandle(mapOf("tripId" to "trip", "ideaId" to "idea")), timeline, links, ideas,
        )
        runCurrent()
        assertEquals("Visit museum", editor.state.value.title)
        assertEquals("City Museum", editor.state.value.locationName)
        editor.save()
        runCurrent()
        coVerify(exactly = 0) { ideas.convertToEntry(any(), any()) }

        editor.onStartAtChange("2026-11-25T10:30:00.000Z")
        editor.save()
        runCurrent()
        assertEquals("2026-11-25T10:30:00.000Z", body.captured.getValue("startAt").jsonPrimitive.content)
        assertEquals(setOf("startAt", "isPrivate"), body.captured.keys)
        assertEquals("false", body.captured.getValue("isPrivate").jsonPrimitive.content)
        assertEquals("event", editor.state.value.entryId)
        coVerify(exactly = 0) { timeline.createTimelineEntry(any()) }
    }
}
