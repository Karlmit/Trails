package com.trails.app.data

import com.trails.app.data.dao.TripDao
import com.trails.app.data.entity.TripEntity
import com.trails.app.network.TrailsApiService
import com.trails.app.network.dto.TripRequest
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject
import javax.inject.Singleton

// Single source of truth for the UI: screens only ever read observeTrips()
// (backed by Room). syncTrips() is the only path that talks to the network,
// and it always writes through Room rather than being read directly -- so a
// screen already showing cached trips keeps working unchanged with zero
// connectivity.
@Singleton
class TripRepository @Inject constructor(
    private val api: TrailsApiService,
    private val tripDao: TripDao,
) {
    fun observeTrips(): Flow<List<TripEntity>> = tripDao.observeAll()

    fun observeTrip(tripId: String): Flow<TripEntity?> = tripDao.observeById(tripId)

    suspend fun syncTrips() {
        val trips = api.listTrips()
        if (trips.isEmpty()) {
            tripDao.deleteAll()
            return
        }
        // Preserve each trip's own cachedOffline flag across this refresh --
        // the flag records "a full TripSyncCoordinator.syncTrip() has run,"
        // which has nothing to do with this shallow trip-list fetch.
        val existingFlags = tripDao.getAllCachedOfflineFlags().associate { it.id to it.cachedOffline }
        tripDao.upsertAll(trips.map { it.toEntity().copy(cachedOffline = existingFlags[it.id] ?: false) })
        tripDao.deleteMissing(trips.map { it.id })
    }

    suspend fun setCachedOffline(tripId: String, cachedOffline: Boolean) {
        tripDao.setCachedOffline(tripId, cachedOffline)
    }

    /** Online-only write: creates the Trip server-side, then mirrors it locally so it shows up immediately. */
    suspend fun createTrip(request: TripRequest): TripEntity {
        val created = api.createTrip(request)
        val entity = created.toEntity()
        tripDao.upsertAll(listOf(entity))
        return entity
    }

    suspend fun updateTrip(tripId: String, request: TripRequest): TripEntity {
        val updated = api.updateTrip(tripId, request)
        val existingFlag = tripDao.getAllCachedOfflineFlags().find { it.id == tripId }?.cachedOffline ?: false
        val entity = updated.toEntity().copy(cachedOffline = existingFlag)
        tripDao.upsertAll(listOf(entity))
        return entity
    }

    suspend fun deleteTrip(tripId: String) {
        api.deleteTrip(tripId)
        tripDao.deleteById(tripId)
    }
}
