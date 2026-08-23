package com.trails.app.data

import com.trails.app.data.dao.ImportantInfoDao
import com.trails.app.data.entity.ImportantInfoEntity
import com.trails.app.network.TrailsApiService
import com.trails.app.network.dto.ImportantInfoRequest
import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.json.JsonObject
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

    /**
     * [fields] is a partial JSON body containing only whatever the edit
     * screen's ViewModel determined actually changed (see
     * PartialPatch.kt's `diffFields`) -- importantInfoUpdateSchema is
     * `.strict()` server-side and has no `tripId` key, but more
     * importantly is a `.partial()` merge, so any field NOT present here
     * keeps its current server-side value untouched.
     */
    suspend fun update(itemId: String, fields: JsonObject): ImportantInfoEntity {
        val updated = api.updateImportantInfo(itemId, fields)
        val entity = updated.toEntity()
        dao.upsertAll(listOf(entity))
        return entity
    }

    suspend fun delete(itemId: String) {
        api.deleteImportantInfo(itemId)
        dao.deleteById(itemId)
    }
}
