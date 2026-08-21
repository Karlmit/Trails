package com.trails.app.data.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import com.trails.app.data.entity.AttachmentEntity
import com.trails.app.data.entity.PhotoEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface AttachmentDao {
    @Query("SELECT * FROM attachments WHERE tripId = :tripId ORDER BY createdAt DESC")
    fun observeForTrip(tripId: String): Flow<List<AttachmentEntity>>

    @Query("SELECT * FROM attachments WHERE ownerType = :ownerType AND ownerId = :ownerId ORDER BY createdAt DESC")
    fun observeForOwner(ownerType: String, ownerId: String): Flow<List<AttachmentEntity>>

    @Query("SELECT * FROM attachments WHERE tripId = :tripId")
    suspend fun getAllForTrip(tripId: String): List<AttachmentEntity>

    @Upsert
    suspend fun upsertAll(attachments: List<AttachmentEntity>)

    @Query("UPDATE attachments SET localPath = :localPath WHERE id = :id")
    suspend fun setLocalPath(id: String, localPath: String)

    @Query("DELETE FROM attachments WHERE tripId = :tripId AND id NOT IN (:keepIds)")
    suspend fun deleteMissing(tripId: String, keepIds: List<String>)

    @Query("DELETE FROM attachments WHERE tripId = :tripId")
    suspend fun deleteAllForTrip(tripId: String)
}

@Dao
interface PhotoDao {
    @Query("SELECT * FROM photos WHERE tripId = :tripId ORDER BY createdAt DESC")
    fun observeForTrip(tripId: String): Flow<List<PhotoEntity>>

    @Query("SELECT * FROM photos WHERE ownerType = :ownerType AND ownerId = :ownerId ORDER BY isPrimary DESC, createdAt DESC")
    fun observeForOwner(ownerType: String, ownerId: String): Flow<List<PhotoEntity>>

    @Query("SELECT * FROM photos WHERE tripId = :tripId")
    suspend fun getAllForTrip(tripId: String): List<PhotoEntity>

    @Upsert
    suspend fun upsertAll(photos: List<PhotoEntity>)

    @Query("UPDATE photos SET localPath = :localPath WHERE id = :id")
    suspend fun setLocalPath(id: String, localPath: String)

    @Query("DELETE FROM photos WHERE tripId = :tripId AND id NOT IN (:keepIds)")
    suspend fun deleteMissing(tripId: String, keepIds: List<String>)

    @Query("DELETE FROM photos WHERE tripId = :tripId")
    suspend fun deleteAllForTrip(tripId: String)
}
