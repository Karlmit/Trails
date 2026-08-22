package com.trails.app.data

import com.trails.app.data.dao.SectionDao
import com.trails.app.data.dao.TimelineEntryDao
import com.trails.app.data.entity.SectionEntity
import com.trails.app.data.entity.TimelineEntryEntity
import com.trails.app.network.TrailsApiService
import com.trails.app.network.dto.BlogPostRequest
import com.trails.app.network.dto.SectionRequest
import com.trails.app.network.dto.TimelineEntryWriteRequest
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class TimelineRepository @Inject constructor(
    private val api: TrailsApiService,
    private val sectionDao: SectionDao,
    private val timelineEntryDao: TimelineEntryDao,
) {
    fun observeSections(tripId: String): Flow<List<SectionEntity>> = sectionDao.observeForTrip(tripId)

    fun observeEntries(tripId: String): Flow<List<TimelineEntryEntity>> = timelineEntryDao.observeForTrip(tripId)

    fun observeEntry(entryId: String): Flow<TimelineEntryEntity?> = timelineEntryDao.observeById(entryId)

    /**
     * Full refresh of one Trip's Sections + TimelineEntries. Draft Blog Posts
     * are already excluded server-side (GET /api/v1/timeline-entries, AD-10),
     * so nothing extra to filter here.
     */
    suspend fun syncTrip(tripId: String) {
        val sections = api.listSections(tripId)
        val entries = api.listTimelineEntries(tripId)

        if (sections.isEmpty()) {
            sectionDao.deleteAllForTrip(tripId)
        } else {
            sectionDao.upsertAll(sections.map { it.toEntity() })
            sectionDao.deleteMissing(tripId, sections.map { it.id })
        }

        if (entries.isEmpty()) {
            timelineEntryDao.deleteAllForTrip(tripId)
        } else {
            timelineEntryDao.upsertAll(entries.map { it.toEntity() })
            timelineEntryDao.deleteMissing(tripId, entries.map { it.id })
        }
    }

    suspend fun createSection(request: SectionRequest): SectionEntity {
        val created = api.createSection(request)
        val entity = created.toEntity()
        sectionDao.upsertAll(listOf(entity))
        return entity
    }

    suspend fun updateSection(sectionId: String, request: SectionRequest): SectionEntity {
        val updated = api.updateSection(sectionId, request)
        val entity = updated.toEntity()
        sectionDao.upsertAll(listOf(entity))
        return entity
    }

    suspend fun deleteSection(sectionId: String) {
        api.deleteSection(sectionId)
        sectionDao.deleteById(sectionId)
    }

    suspend fun createTimelineEntry(request: TimelineEntryWriteRequest): TimelineEntryEntity {
        val created = when (request) {
            is TimelineEntryWriteRequest.Note -> api.createNoteEntry(request.body)
            is TimelineEntryWriteRequest.Stay -> api.createStayEntry(request.body)
            is TimelineEntryWriteRequest.Transport -> api.createTransportEntry(request.body)
            is TimelineEntryWriteRequest.Activity -> api.createActivityEntry(request.body)
        }
        val entity = created.toEntity()
        timelineEntryDao.upsertAll(listOf(entity))
        return entity
    }

    suspend fun updateTimelineEntry(entryId: String, request: TimelineEntryWriteRequest): TimelineEntryEntity {
        val updated = when (request) {
            is TimelineEntryWriteRequest.Note -> api.updateNoteEntry(entryId, request.body)
            is TimelineEntryWriteRequest.Stay -> api.updateStayEntry(entryId, request.body)
            is TimelineEntryWriteRequest.Transport -> api.updateTransportEntry(entryId, request.body)
            is TimelineEntryWriteRequest.Activity -> api.updateActivityEntry(entryId, request.body)
        }
        val entity = updated.toEntity()
        timelineEntryDao.upsertAll(listOf(entity))
        return entity
    }

    suspend fun deleteTimelineEntry(entryId: String) {
        api.deleteTimelineEntry(entryId)
        timelineEntryDao.deleteById(entryId)
    }

    suspend fun createBlogPost(request: BlogPostRequest): TimelineEntryEntity {
        val created = api.createBlogPost(request)
        val entity = created.toEntity()
        timelineEntryDao.upsertAll(listOf(entity))
        return entity
    }

    suspend fun updateBlogPost(entryId: String, request: BlogPostRequest): TimelineEntryEntity {
        val updated = api.updateBlogPost(entryId, request)
        val entity = updated.toEntity()
        timelineEntryDao.upsertAll(listOf(entity))
        return entity
    }

    suspend fun publishBlogPost(entryId: String): TimelineEntryEntity {
        val updated = api.publishBlogPost(entryId)
        val entity = updated.toEntity()
        timelineEntryDao.upsertAll(listOf(entity))
        return entity
    }

    suspend fun unpublishBlogPost(entryId: String) {
        api.unpublishBlogPost(entryId)
        timelineEntryDao.deleteById(entryId)
    }
}
