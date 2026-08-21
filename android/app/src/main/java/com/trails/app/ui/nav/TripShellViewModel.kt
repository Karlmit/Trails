package com.trails.app.ui.nav

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trails.app.data.TripRepository
import com.trails.app.data.entity.TripEntity
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

/** Backs TripDrawerScaffold -- just enough Trip data to render the drawer header and gate Travel Mode. */
@HiltViewModel
class TripShellViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    tripRepository: TripRepository,
) : ViewModel() {
    private val tripId: String = checkNotNull(savedStateHandle["tripId"])

    val trip: StateFlow<TripEntity?> = tripRepository.observeTrip(tripId)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)
}
