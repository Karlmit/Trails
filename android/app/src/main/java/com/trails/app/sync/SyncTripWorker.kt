package com.trails.app.sync

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.trails.app.data.TimelineRepository
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject

@HiltWorker
class SyncTripWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted workerParams: WorkerParameters,
    private val timelineRepository: TimelineRepository,
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        val tripId = inputData.getString(KEY_TRIP_ID) ?: return Result.failure()
        return try {
            timelineRepository.syncTrip(tripId)
            Result.success()
        } catch (e: Exception) {
            // A single attempt per user-triggered sync (pull-to-refresh, or
            // opening a Trip) -- covers "offline" and any transient server
            // error alike. Cached data already on-device stays fully usable
            // either way; the user can just try again. Automatic background
            // retry policy is a Phase 5 concern, not needed for this
            // one-shot on-demand sync.
            Result.failure()
        }
    }

    companion object {
        const val KEY_TRIP_ID = "tripId"
    }
}
