package com.trails.app.data

import com.trails.app.data.dao.IdeaDao
import com.trails.app.data.dao.TimelineEntryDao
import com.trails.app.data.entity.IdeaEntity
import com.trails.app.data.entity.TimelineEntryEntity
import com.trails.app.network.TrailsApiService
import com.trails.app.network.dto.IdeaRequest
import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.json.JsonObject
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class IdeaRepository @Inject constructor(
    private val api: TrailsApiService,
    private val dao: IdeaDao,
    private val timelineEntryDao: TimelineEntryDao,
) {
    fun observeForTrip(tripId: String): Flow<List<IdeaEntity>> = dao.observeForTrip(tripId)

    suspend fun syncTrip(tripId: String) {
        val remote = api.listIdeas(tripId)
        if (remote.isEmpty()) {
            dao.deleteAllForTrip(tripId)
        } else {
            dao.upsertAll(remote.map { it.toEntity() })
            dao.deleteMissing(tripId, remote.map { it.id })
        }
    }

    suspend fun create(request: IdeaRequest): IdeaEntity {
        val created = api.createIdea(request)
        val entity = created.toEntity()
        dao.upsertAll(listOf(entity))
        return entity
    }

    /**
     * [fields] is a partial JSON body containing only whatever the edit
     * screen's ViewModel determined actually changed (see
     * PartialPatch.kt's `diffFields`) -- ideaUpdateSchema is `.strict()`
     * server-side and has no `tripId` key, but more importantly is a
     * `.partial()` merge, so any field NOT present here keeps its current
     * server-side value untouched.
     */
    suspend fun update(ideaId: String, fields: JsonObject): IdeaEntity {
        val updated = api.updateIdea(ideaId, fields)
        val entity = updated.toEntity()
        dao.upsertAll(listOf(entity))
        return entity
    }

    suspend fun delete(ideaId: String) {
        api.deleteIdea(ideaId)
        dao.deleteById(ideaId)
    }

    /** Converts an Idea into a real TimelineEntry server-side, removing the Idea locally and caching the new entry. */
    suspend fun convertToEntry(ideaId: String): TimelineEntryEntity {
        val created = api.convertIdea(ideaId)
        val entity = created.toEntity()
        timelineEntryDao.upsertAll(listOf(entity))
        dao.deleteById(ideaId)
        return entity
    }
}
