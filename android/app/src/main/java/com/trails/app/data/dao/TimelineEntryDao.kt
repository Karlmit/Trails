package com.trails.app.data.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import com.trails.app.data.entity.TimelineEntryEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface TimelineEntryDao {
    @Query("SELECT * FROM timeline_entries WHERE tripId = :tripId ORDER BY startAt ASC")
    fun observeForTrip(tripId: String): Flow<List<TimelineEntryEntity>>

    @Query("SELECT * FROM timeline_entries WHERE id = :entryId")
    fun observeById(entryId: String): Flow<TimelineEntryEntity?>

    @Upsert
    suspend fun upsertAll(entries: List<TimelineEntryEntity>)

    @Query("DELETE FROM timeline_entries WHERE tripId = :tripId AND id NOT IN (:keepIds)")
    suspend fun deleteMissing(tripId: String, keepIds: List<String>)

    @Query("DELETE FROM timeline_entries WHERE tripId = :tripId")
    suspend fun deleteAllForTrip(tripId: String)
}
