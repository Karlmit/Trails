package com.trails.app.sync

import android.content.Context
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkInfo
import androidx.work.WorkManager
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

private const val CHECKLIST_ITEM_SYNC_WORK_NAME = "checklist-item-sync"

@Singleton
class SyncScheduler @Inject constructor(@ApplicationContext private val context: Context) {

    fun syncTripNow(tripId: String): UUID {
        val request = OneTimeWorkRequestBuilder<SyncTripWorker>()
            .setInputData(Data.Builder().putString(SyncTripWorker.KEY_TRIP_ID, tripId).build())
            .build()
        WorkManager.getInstance(context).enqueue(request)
        return request.id
    }

    fun observeWork(id: UUID): Flow<WorkInfo?> = WorkManager.getInstance(context).getWorkInfoByIdFlow(id)

    /**
     * User-requested: a Checklist item's checked toggle must sync once
     * back online, not just on the next manual refresh. Held by WorkManager
     * itself until connectivity actually returns; `REPLACE` collapses
     * several offline toggles in a row into a single pending job instead of
     * piling up duplicates.
     */
    fun scheduleChecklistItemRetry() {
        val request = OneTimeWorkRequestBuilder<ChecklistItemSyncWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(context)
            .enqueueUniqueWork(CHECKLIST_ITEM_SYNC_WORK_NAME, ExistingWorkPolicy.REPLACE, request)
    }
}
