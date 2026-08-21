package com.trails.app.ui.importantinfo

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import com.trails.app.data.ImportantInfoRepository
import com.trails.app.data.entity.ImportantInfoEntity
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

@HiltViewModel
class ImportantInfoViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    repository: ImportantInfoRepository,
) : ViewModel() {
    private val tripId: String = checkNotNull(savedStateHandle["tripId"])
    val items: Flow<List<ImportantInfoEntity>> = repository.observeForTrip(tripId)
}
