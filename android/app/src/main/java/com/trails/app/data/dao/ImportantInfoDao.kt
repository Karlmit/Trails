package com.trails.app.data.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import com.trails.app.data.entity.ImportantInfoEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface ImportantInfoDao {
    @Query("SELECT * FROM important_info WHERE tripId = :tripId ORDER BY createdAt ASC")
    fun observeForTrip(tripId: String): Flow<List<ImportantInfoEntity>>

    @Upsert
    suspend fun upsertAll(items: List<ImportantInfoEntity>)

    @Query("DELETE FROM important_info WHERE tripId = :tripId AND id NOT IN (:keepIds)")
    suspend fun deleteMissing(tripId: String, keepIds: List<String>)

    @Query("DELETE FROM important_info WHERE tripId = :tripId")
    suspend fun deleteAllForTrip(tripId: String)
}
