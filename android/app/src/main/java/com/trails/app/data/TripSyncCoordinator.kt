package com.trails.app.data

import kotlinx.coroutines.CancellationException
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Full refresh of everything one Trip's screens need offline: Sections +
 * TimelineEntries (TimelineRepository), Checklists+Items, Important Info,
 * Ideas, and Attachments/Photos (metadata + cached bytes, DocumentsRepository).
 * This is what SyncTripWorker actually runs -- one coordinator per Trip
 * sync, rather than each screen syncing its own slice independently and
 * racing/duplicating work. Marks the Trip's own cachedOffline flag true only
 * once every step here has actually succeeded -- a partial sync (e.g. this
 * ran offline and every step no-opped/failed) must not claim the trip is
 * safely available offline when it isn't.
 */
@Singleton
class TripSyncCoordinator @Inject constructor(
    private val tripRepository: TripRepository,
    private val timelineRepository: TimelineRepository,
    private val checklistRepository: ChecklistRepository,
    private val importantInfoRepository: ImportantInfoRepository,
    private val ideaRepository: IdeaRepository,
    private val documentsRepository: DocumentsRepository,
) {
    suspend fun syncTrip(tripId: String) {
        // Each domain is an independent server/cache projection. One bad
        // response must not prevent every later domain from refreshing.
        val failures = mutableListOf<Exception>()
        suspend fun attempt(sync: suspend () -> Unit) {
            try {
                sync()
            } catch (failure: CancellationException) {
                throw failure
            } catch (failure: Exception) {
                failures += failure
            }
        }

        attempt { timelineRepository.syncTrip(tripId) }
        attempt { checklistRepository.syncTrip(tripId) }
        attempt { importantInfoRepository.syncTrip(tripId) }
        attempt { ideaRepository.syncTrip(tripId) }
        attempt { documentsRepository.syncTrip(tripId) }

        if (failures.isNotEmpty()) {
            val first = failures.first()
            failures.drop(1).forEach(first::addSuppressed)
            throw first
        }
        tripRepository.setCachedOffline(tripId, true)
    }
}
