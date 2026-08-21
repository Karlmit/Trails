package com.trails.app.data

import com.trails.app.data.dao.IdeaDao
import com.trails.app.data.entity.IdeaEntity
import com.trails.app.network.TrailsApiService
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class IdeaRepository @Inject constructor(
    private val api: TrailsApiService,
    private val dao: IdeaDao,
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
}
