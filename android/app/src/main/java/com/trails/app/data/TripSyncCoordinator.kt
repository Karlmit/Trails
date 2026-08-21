package com.trails.app.data

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
        timelineRepository.syncTrip(tripId)
        checklistRepository.syncTrip(tripId)
        importantInfoRepository.syncTrip(tripId)
        ideaRepository.syncTrip(tripId)
        documentsRepository.syncTrip(tripId)
        tripRepository.setCachedOffline(tripId, true)
    }
}
