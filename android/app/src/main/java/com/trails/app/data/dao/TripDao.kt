package com.trails.app.data.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import com.trails.app.data.entity.TripEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface TripDao {
    @Query("SELECT * FROM trips ORDER BY startDate ASC")
    fun observeAll(): Flow<List<TripEntity>>

    @Query("SELECT * FROM trips WHERE id = :tripId")
    fun observeById(tripId: String): Flow<TripEntity?>

    @Query("SELECT id, cachedOffline FROM trips")
    suspend fun getAllCachedOfflineFlags(): List<TripCachedOfflineFlag>

    @Upsert
    suspend fun upsertAll(trips: List<TripEntity>)

    @Query("UPDATE trips SET cachedOffline = :cachedOffline WHERE id = :tripId")
    suspend fun setCachedOffline(tripId: String, cachedOffline: Boolean)

    @Query("DELETE FROM trips WHERE id NOT IN (:keepIds)")
    suspend fun deleteMissing(keepIds: List<String>)

    @Query("DELETE FROM trips WHERE id = :tripId")
    suspend fun deleteById(tripId: String)

    @Query("DELETE FROM trips")
    suspend fun deleteAll()
}

data class TripCachedOfflineFlag(val id: String, val cachedOffline: Boolean)
