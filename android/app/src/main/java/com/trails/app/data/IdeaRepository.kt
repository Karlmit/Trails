package com.trails.app.data

import com.trails.app.data.dao.IdeaDao
import com.trails.app.data.dao.TimelineEntryDao
import com.trails.app.data.entity.IdeaEntity
import com.trails.app.data.entity.TimelineEntryEntity
import com.trails.app.network.TrailsApiService
import com.trails.app.network.dto.IdeaRequest
import com.trails.app.network.dto.IdeaUpdateRequest
import kotlinx.coroutines.flow.Flow
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

    suspend fun update(ideaId: String, request: IdeaRequest): IdeaEntity {
        // ideaUpdateSchema is `.strict()` server-side and has no `tripId` key --
        // sending the full create-shaped request body would 400.
        val updateBody = IdeaUpdateRequest(
            sectionId = request.sectionId,
            title = request.title,
            category = request.category,
            priority = request.priority,
            weatherSuitability = request.weatherSuitability,
            weatherTags = request.weatherTags,
            locationName = request.locationName,
            locationAddress = request.locationAddress,
            locationLat = request.locationLat,
            locationLng = request.locationLng,
            locationMapLink = request.locationMapLink,
            estimatedExpenseAmount = request.estimatedExpenseAmount,
            estimatedExpenseCurrency = request.estimatedExpenseCurrency,
        )
        val updated = api.updateIdea(ideaId, updateBody)
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
