package com.trails.app.data

import com.trails.app.data.dao.TripDao
import com.trails.app.data.entity.TripEntity
import com.trails.app.network.TrailsApiService
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

    suspend fun syncTrips() {
        val trips = api.listTrips()
        if (trips.isEmpty()) {
            tripDao.deleteAll()
        } else {
            tripDao.upsertAll(trips.map { it.toEntity() })
            tripDao.deleteMissing(trips.map { it.id })
        }
    }
}
