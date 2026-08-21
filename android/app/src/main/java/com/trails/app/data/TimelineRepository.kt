package com.trails.app.data

import com.trails.app.data.dao.SectionDao
import com.trails.app.data.dao.TimelineEntryDao
import com.trails.app.data.entity.SectionEntity
import com.trails.app.data.entity.TimelineEntryEntity
import com.trails.app.network.TrailsApiService
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
}
