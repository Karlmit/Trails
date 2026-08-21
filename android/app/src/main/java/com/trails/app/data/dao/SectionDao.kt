package com.trails.app.data.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import com.trails.app.data.entity.SectionEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface SectionDao {
    @Query("SELECT * FROM sections WHERE tripId = :tripId ORDER BY startDate ASC")
    fun observeForTrip(tripId: String): Flow<List<SectionEntity>>

    @Upsert
    suspend fun upsertAll(sections: List<SectionEntity>)

    @Query("DELETE FROM sections WHERE tripId = :tripId AND id NOT IN (:keepIds)")
    suspend fun deleteMissing(tripId: String, keepIds: List<String>)

    @Query("DELETE FROM sections WHERE tripId = :tripId")
    suspend fun deleteAllForTrip(tripId: String)

    @Query("DELETE FROM sections WHERE id = :sectionId")
    suspend fun deleteById(sectionId: String)
}
