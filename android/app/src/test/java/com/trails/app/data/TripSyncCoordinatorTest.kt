package com.trails.app.data

import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import org.junit.Assert.fail
import org.junit.Test

class TripSyncCoordinatorTest {
    @Test
    fun `one domain failure does not skip later domains or mark trip complete`() = runTest {
        val tripRepository = mockk<TripRepository>(relaxed = true)
        val timeline = mockk<TimelineRepository>()
        val checklists = mockk<ChecklistRepository>(relaxed = true)
        val info = mockk<ImportantInfoRepository>(relaxed = true)
        val ideas = mockk<IdeaRepository>(relaxed = true)
        val documents = mockk<DocumentsRepository>(relaxed = true)
        coEvery { timeline.syncTrip("trip") } throws IllegalStateException("timeline failed")
        val coordinator = TripSyncCoordinator(tripRepository, timeline, checklists, info, ideas, documents)

        try {
            coordinator.syncTrip("trip")
            fail("Expected the isolated domain failure to propagate")
        } catch (_: IllegalStateException) {
            // expected
        }

        coVerify(exactly = 1) { checklists.syncTrip("trip") }
        coVerify(exactly = 1) { info.syncTrip("trip") }
        coVerify(exactly = 1) { ideas.syncTrip("trip") }
        coVerify(exactly = 1) { documents.syncTrip("trip") }
        coVerify(exactly = 0) { tripRepository.setCachedOffline(any(), true) }
    }
}
