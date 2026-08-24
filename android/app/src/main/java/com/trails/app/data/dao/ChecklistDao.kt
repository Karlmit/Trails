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

    @Query("DELETE FROM checklists WHERE id = :checklistId")
    suspend fun deleteById(checklistId: String)
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

    // Immediate, always-succeeds local write for a checked toggle -- marks
    // it `syncPending` so it can be found and pushed later regardless of
    // whether the network PATCH that follows succeeds or not.
    @Query("UPDATE checklist_items SET checked = :checked, syncPending = 1 WHERE id = :id")
    suspend fun setCheckedPending(id: String, checked: Boolean)

    @Query("SELECT * FROM checklist_items WHERE syncPending = 1")
    suspend fun getAllPending(): List<ChecklistItemEntity>

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

    @Query("DELETE FROM checklist_items WHERE id = :itemId")
    suspend fun deleteById(itemId: String)
}
