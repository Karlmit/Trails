package com.trails.app.sync

import android.content.Context
import androidx.work.Data
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkInfo
import androidx.work.WorkManager
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

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
}
