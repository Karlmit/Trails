package com.trails.app.data

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.trails.app.data.entity.TripEntity
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Verifies the core Phase 1 promise at the data layer: once a Trip has been
 * written into Room (standing in for a completed sync), it reads back
 * unchanged with no network involved at all -- exactly what "browse offline
 * after first sync" requires. Runs on the JVM via Robolectric, no
 * device/emulator needed.
 */
@RunWith(RobolectricTestRunner::class)
class TripRepositoryOfflineReadTest {

    private lateinit var db: AppDatabase

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), AppDatabase::class.java).build()
    }

    @After
    fun tearDown() {
        db.close()
    }

    @Test
    fun `a synced trip reads back from Room with no network call`() = runTest {
        val trip = TripEntity(
            id = "11111111-1111-4111-8111-111111111111",
            name = "Thailand",
            destination = "Bangkok",
            startDate = "2026-08-01",
            endDate = "2026-08-20",
            timezone = "Asia/Bangkok",
            description = null,
            coverImage = null,
            visibility = "PRIVATE",
            status = "UPCOMING",
            durationDays = 20,
            createdAt = "2026-07-01T00:00:00.000Z",
            updatedAt = "2026-07-01T00:00:00.000Z",
        )
        db.tripDao().upsertAll(listOf(trip))

        val cached = db.tripDao().observeAll().first()

        assertEquals(1, cached.size)
        assertEquals(trip, cached.first())
    }

    @Test
    fun `a trip no longer returned by the server drops out of the local cache`() = runTest {
        val kept = TripEntity(
            id = "22222222-2222-4222-8222-222222222222",
            name = "Kept trip",
            destination = null,
            startDate = "2025-06-01",
            endDate = "2025-06-05",
            timezone = "UTC",
            description = null,
            coverImage = null,
            visibility = "PRIVATE",
            status = "COMPLETED",
            durationDays = 5,
            createdAt = "2025-06-01T00:00:00.000Z",
            updatedAt = "2025-06-01T00:00:00.000Z",
        )
        val removed = kept.copy(id = "33333333-3333-4333-8333-333333333333", name = "Removed trip")
        db.tripDao().upsertAll(listOf(kept, removed))

        // Mirrors TripRepository.syncTrips()'s non-empty branch: re-upsert the
        // server's current list, then delete anything else -- the DELETE ...
        // NOT IN (:keepIds) query, exercised here with a genuinely non-empty
        // keep list (an empty server list instead takes the repository's
        // separate deleteAll() branch, never this query with an empty list).
        db.tripDao().deleteMissing(keepIds = listOf(kept.id))

        val cached = db.tripDao().observeAll().first()
        assertEquals(listOf(kept), cached)
    }
}
