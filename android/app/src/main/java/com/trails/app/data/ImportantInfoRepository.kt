package com.trails.app.data

import com.trails.app.data.dao.ImportantInfoDao
import com.trails.app.data.entity.ImportantInfoEntity
import com.trails.app.network.TrailsApiService
import com.trails.app.network.dto.ImportantInfoRequest
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ImportantInfoRepository @Inject constructor(
    private val api: TrailsApiService,
    private val dao: ImportantInfoDao,
) {
    fun observeForTrip(tripId: String): Flow<List<ImportantInfoEntity>> = dao.observeForTrip(tripId)

    suspend fun syncTrip(tripId: String) {
        val remote = api.listImportantInfo(tripId)
        if (remote.isEmpty()) {
            dao.deleteAllForTrip(tripId)
        } else {
            dao.upsertAll(remote.map { it.toEntity() })
            dao.deleteMissing(tripId, remote.map { it.id })
        }
    }

    suspend fun create(request: ImportantInfoRequest): ImportantInfoEntity {
        val created = api.createImportantInfo(request)
        val entity = created.toEntity()
        dao.upsertAll(listOf(entity))
        return entity
    }

    suspend fun update(itemId: String, request: ImportantInfoRequest): ImportantInfoEntity {
        val updated = api.updateImportantInfo(itemId, request)
        val entity = updated.toEntity()
        dao.upsertAll(listOf(entity))
        return entity
    }

    suspend fun delete(itemId: String) {
        api.deleteImportantInfo(itemId)
        dao.deleteById(itemId)
    }
}
