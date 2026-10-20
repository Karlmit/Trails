package com.trails.app.sync

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * Shared "pull to refresh" building block for every trip-content screen --
 * user-requested: a way to force a fresh sync from any page without
 * restarting the app. Wraps the same syncTripNow()+observeWork() pattern
 * [TimelineViewModel]/[TripListViewModel] already hand-rolled, so the other
 * ~10 screens don't each duplicate it. A ViewModel composes one of these
 * (not a base class, since these ViewModels already extend [ViewModel] and
 * Kotlin has no multiple inheritance) and exposes its [isRefreshing]/
 * [refresh] under its own names.
 */
class TripRefresher(
    private val scope: CoroutineScope,
    private val tripId: String,
    private val syncScheduler: SyncScheduler,
) {
    private val _isRefreshing = MutableStateFlow(false)
    val isRefreshing: StateFlow<Boolean> = _isRefreshing.asStateFlow()

    fun refresh() {
        if (_isRefreshing.value) return
        _isRefreshing.value = true
        scope.launch {
            try {
                val workId = syncScheduler.syncTripNow(tripId)
                // WorkManager may emit null before the newly-enqueued request
                // is persisted. That is "not visible yet", not "finished".
                syncScheduler.observeWork(workId).filterNotNull().first { it.state.isFinished }
            } finally {
                _isRefreshing.value = false
            }
        }
    }
}
