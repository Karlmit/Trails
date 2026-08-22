package com.trails.app.data

import com.trails.app.data.dao.ImportantInfoDao
import com.trails.app.data.entity.ImportantInfoEntity
import com.trails.app.network.TrailsApiService
import com.trails.app.network.dto.ImportantInfoRequest
import com.trails.app.network.dto.ImportantInfoUpdateRequest
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
        // importantInfoUpdateSchema is `.strict()` server-side and has no `tripId`
        // key -- sending the full create-shaped request body would 400.
        val updateBody = ImportantInfoUpdateRequest(
            title = request.title,
            content = request.content,
            locationName = request.locationName,
            locationAddress = request.locationAddress,
            locationLat = request.locationLat,
            locationLng = request.locationLng,
            locationMapLink = request.locationMapLink,
            contactName = request.contactName,
            contactPhone = request.contactPhone,
            contactEmail = request.contactEmail,
            isPrivate = request.isPrivate,
        )
        val updated = api.updateImportantInfo(itemId, updateBody)
        val entity = updated.toEntity()
        dao.upsertAll(listOf(entity))
        return entity
    }

    suspend fun delete(itemId: String) {
        api.deleteImportantInfo(itemId)
        dao.deleteById(itemId)
    }
}
