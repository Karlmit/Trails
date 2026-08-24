package com.trails.app.sync

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.trails.app.data.ChecklistRepository
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject

/**
 * User-requested: a Checklist item's checked state must save locally when
 * offline and push to the server once back online, not just fail. This is
 * the "once back online" half -- enqueued (see SyncScheduler
 * .scheduleChecklistItemRetry) with a `NetworkType.CONNECTED` constraint
 * whenever [ChecklistRepository.setChecked]'s immediate PATCH attempt
 * fails, so WorkManager itself holds the job until connectivity actually
 * returns rather than this app polling for it. One attempt per run, same
 * "no automatic retry policy yet" philosophy as SyncTripWorker -- a run
 * that still fails (e.g. the item was deleted server-side in the meantime)
 * just leaves that row `syncPending` for the next opportunity (the next
 * full trip sync also flushes pending items, see
 * ChecklistRepository.syncTrip).
 */
@HiltWorker
class ChecklistItemSyncWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted workerParams: WorkerParameters,
    private val checklistRepository: ChecklistRepository,
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        return try {
            checklistRepository.flushPendingItems()
            Result.success()
        } catch (e: Exception) {
            Result.failure()
        }
    }
}
