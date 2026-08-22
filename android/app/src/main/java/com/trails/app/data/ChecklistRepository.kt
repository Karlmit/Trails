package com.trails.app.data

import com.trails.app.data.dao.ChecklistDao
import com.trails.app.data.dao.ChecklistItemDao
import com.trails.app.data.entity.ChecklistEntity
import com.trails.app.data.entity.ChecklistItemEntity
import com.trails.app.network.TrailsApiService
import com.trails.app.network.dto.ChecklistItemPatchRequest
import com.trails.app.network.dto.ChecklistItemRequest
import com.trails.app.network.dto.ChecklistRequest
import com.trails.app.network.dto.ChecklistUpdateRequest
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import javax.inject.Inject
import javax.inject.Singleton

data class ChecklistWithItems(val checklist: ChecklistEntity, val items: List<ChecklistItemEntity>)

@Singleton
class ChecklistRepository @Inject constructor(
    private val api: TrailsApiService,
    private val checklistDao: ChecklistDao,
    private val itemDao: ChecklistItemDao,
) {
    fun observeForTrip(tripId: String): Flow<List<ChecklistWithItems>> =
        combine(checklistDao.observeForTrip(tripId), itemDao.observeForTrip(tripId)) { checklists, items ->
            checklists.map { checklist ->
                ChecklistWithItems(checklist, items.filter { it.checklistId == checklist.id })
            }
        }

    suspend fun syncTrip(tripId: String) {
        val remote = api.listChecklists(tripId)
        if (remote.isEmpty()) {
            itemDao.deleteAllForTrip(tripId)
            checklistDao.deleteAllForTrip(tripId)
            return
        }
        checklistDao.upsertAll(remote.map { it.toEntity() })
        checklistDao.deleteMissing(tripId, remote.map { it.id })

        val allItems = remote.flatMap { it.items }
        if (allItems.isEmpty()) {
            itemDao.deleteAllForTrip(tripId)
        } else {
            itemDao.upsertAll(allItems.map { it.toEntity() })
            itemDao.deleteMissing(tripId, allItems.map { it.id })
        }
    }

    /** Online-only action: PATCHes the server first, then mirrors the result locally. */
    suspend fun setChecked(itemId: String, checked: Boolean) {
        val updated = api.patchChecklistItem(itemId, ChecklistItemPatchRequest(checked))
        itemDao.setChecked(updated.id, updated.checked)
    }

    suspend fun createChecklist(request: ChecklistRequest): ChecklistEntity {
        val created = api.createChecklist(request)
        val entity = created.toEntity()
        checklistDao.upsertAll(listOf(entity))
        return entity
    }

    suspend fun updateChecklist(checklistId: String, request: ChecklistRequest): ChecklistEntity {
        // checklistUpdateSchema is `.strict()` server-side and has no `tripId` key --
        // sending the full create-shaped request body would 400.
        val updated = api.updateChecklist(checklistId, ChecklistUpdateRequest(request.title, request.description))
        val entity = updated.toEntity()
        checklistDao.upsertAll(listOf(entity))
        return entity
    }

    suspend fun deleteChecklist(checklistId: String) {
        api.deleteChecklist(checklistId)
        checklistDao.deleteById(checklistId)
    }

    suspend fun createChecklistItem(request: ChecklistItemRequest): ChecklistItemEntity {
        val created = api.createChecklistItem(request)
        val entity = created.toEntity()
        itemDao.upsertAll(listOf(entity))
        return entity
    }

    suspend fun deleteChecklistItem(itemId: String) {
        api.deleteChecklistItem(itemId)
        itemDao.deleteById(itemId)
    }
}
