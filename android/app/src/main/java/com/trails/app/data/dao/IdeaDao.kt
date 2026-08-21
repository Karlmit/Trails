package com.trails.app.data.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import com.trails.app.data.entity.IdeaEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface IdeaDao {
    @Query("SELECT * FROM ideas WHERE tripId = :tripId ORDER BY createdAt ASC")
    fun observeForTrip(tripId: String): Flow<List<IdeaEntity>>

    @Upsert
    suspend fun upsertAll(ideas: List<IdeaEntity>)

    @Query("DELETE FROM ideas WHERE tripId = :tripId AND id NOT IN (:keepIds)")
    suspend fun deleteMissing(tripId: String, keepIds: List<String>)

    @Query("DELETE FROM ideas WHERE tripId = :tripId")
    suspend fun deleteAllForTrip(tripId: String)

    @Query("DELETE FROM ideas WHERE id = :ideaId")
    suspend fun deleteById(ideaId: String)
}
