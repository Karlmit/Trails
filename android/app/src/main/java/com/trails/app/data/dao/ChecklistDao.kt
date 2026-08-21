package com.trails.app.data.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import com.trails.app.data.entity.ChecklistEntity
import com.trails.app.data.entity.ChecklistItemEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface ChecklistDao {
    @Query("SELECT * FROM checklists WHERE tripId = :tripId ORDER BY createdAt ASC")
    fun observeForTrip(tripId: String): Flow<List<ChecklistEntity>>

    @Upsert
    suspend fun upsertAll(checklists: List<ChecklistEntity>)

    @Query("DELETE FROM checklists WHERE tripId = :tripId AND id NOT IN (:keepIds)")
    suspend fun deleteMissing(tripId: String, keepIds: List<String>)

    @Query("DELETE FROM checklists WHERE tripId = :tripId")
    suspend fun deleteAllForTrip(tripId: String)
}

@Dao
interface ChecklistItemDao {
    @Query(
        "SELECT * FROM checklist_items WHERE checklistId IN " +
            "(SELECT id FROM checklists WHERE tripId = :tripId) ORDER BY createdAt ASC",
    )
    fun observeForTrip(tripId: String): Flow<List<ChecklistItemEntity>>

    @Upsert
    suspend fun upsertAll(items: List<ChecklistItemEntity>)

    @Query("UPDATE checklist_items SET checked = :checked WHERE id = :id")
    suspend fun setChecked(id: String, checked: Boolean)

    @Query(
        "DELETE FROM checklist_items WHERE checklistId IN " +
            "(SELECT id FROM checklists WHERE tripId = :tripId) AND id NOT IN (:keepIds)",
    )
    suspend fun deleteMissing(tripId: String, keepIds: List<String>)

    @Query(
        "DELETE FROM checklist_items WHERE checklistId IN " +
            "(SELECT id FROM checklists WHERE tripId = :tripId)",
    )
    suspend fun deleteAllForTrip(tripId: String)
}
