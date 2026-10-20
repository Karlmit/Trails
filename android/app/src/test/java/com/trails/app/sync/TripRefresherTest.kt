package com.trails.app.sync

import androidx.work.WorkInfo
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import java.util.UUID

class TripRefresherTest {
    @Test
    fun `null work emission completes successfully and duplicate refresh is ignored`() {
        val dispatcher = StandardTestDispatcher()
        val scope = TestScope(dispatcher)
        val scheduler = mockk<SyncScheduler>()
        val id = UUID.randomUUID()
        val succeeded = mockk<WorkInfo> { every { state } returns WorkInfo.State.SUCCEEDED }
        every { scheduler.syncTripNow("trip") } returns id
        every { scheduler.observeWork(id) } returns flowOf(null, succeeded)
        val refresher = TripRefresher(scope, "trip", scheduler)

        refresher.refresh()
        refresher.refresh()
        scope.advanceUntilIdle()

        verify(exactly = 1) { scheduler.syncTripNow("trip") }
        assertFalse(refresher.isRefreshing.value)
        assertNull(refresher.refreshError.value)
    }

    @Test
    fun `failed work retains failure and always clears refreshing`() {
        val dispatcher = StandardTestDispatcher()
        val scope = TestScope(dispatcher)
        val scheduler = mockk<SyncScheduler>()
        val id = UUID.randomUUID()
        val failed = mockk<WorkInfo> { every { state } returns WorkInfo.State.FAILED }
        every { scheduler.syncTripNow("trip") } returns id
        every { scheduler.observeWork(id) } returns flowOf(failed)
        val refresher = TripRefresher(scope, "trip", scheduler)

        refresher.refresh()
        scope.advanceUntilIdle()

        assertFalse(refresher.isRefreshing.value)
        assertNotNull(refresher.refreshError.value)
    }
}
