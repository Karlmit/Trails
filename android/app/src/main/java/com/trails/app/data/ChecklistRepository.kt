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
import com.trails.app.sync.SyncScheduler
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
    private val syncScheduler: SyncScheduler,
) {
    fun observeForTrip(tripId: String): Flow<List<ChecklistWithItems>> =
        combine(checklistDao.observeForTrip(tripId), itemDao.observeForTrip(tripId)) { checklists, items ->
            checklists.map { checklist ->
                ChecklistWithItems(checklist, items.filter { it.checklistId == checklist.id })
            }
        }

    suspend fun syncTrip(tripId: String) {
        // Push any offline-made checked toggles before pulling the server's
        // own state down, so they aren't overwritten by what's now stale
        // server-side data for those specific items.
        flushPendingItems()

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

    /**
     * Pushes every locally-pending checked toggle (across every Trip) to
     * the server. Called both by [ChecklistItemSyncWorker] (the
     * network-constrained "once back online" retry) and by [syncTrip]
     * itself (so any regular sync -- pull-to-refresh, opening a screen --
     * also flushes whatever's pending). A single attempt per item per
     * call; one that still fails (offline, or a genuine server error)
     * just stays `syncPending` for the next opportunity.
     */
    suspend fun flushPendingItems() {
        itemDao.getAllPending().forEach { pending ->
            runCatching { api.patchChecklistItem(pending.id, ChecklistItemPatchRequest(pending.checked)) }
                .onSuccess { itemDao.upsertAll(listOf(it.toEntity())) }
        }
    }

    /**
     * User-requested: a checked toggle must save locally when offline and
     * sync once back online, not fail outright. Always writes the local
     * row immediately (works with zero connectivity); the PATCH attempt
     * that follows either confirms it right away, or -- on any failure --
     * leaves it `syncPending` and schedules [SyncScheduler
     * .scheduleChecklistItemRetry] to push it once connectivity returns.
     * Deliberately never throws: an offline toggle is expected, successful
     * behavior now, not an error to surface.
     */
    suspend fun setChecked(itemId: String, checked: Boolean) {
        itemDao.setCheckedPending(itemId, checked)
        runCatching { api.patchChecklistItem(itemId, ChecklistItemPatchRequest(checked)) }
            .onSuccess { itemDao.upsertAll(listOf(it.toEntity())) }
            .onFailure { syncScheduler.scheduleChecklistItemRetry() }
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
        val updated = api.updateChecklist(checklistId, ChecklistUpdateRequest(request.title, request.emoji, request.isPrivate))
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
