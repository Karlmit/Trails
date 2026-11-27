package com.trails.app.ui.blog

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trails.app.data.TimelineRepository
import com.trails.app.network.dto.TripBlogStatisticsDto
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.LocalDate
import javax.inject.Inject

internal data class BlogStatisticsState(
    val data: TripBlogStatisticsDto? = null,
    val loading: Boolean = false,
    val failed: Boolean = false,
)

internal data class DailyBlogViews(val date: LocalDate, val views: Long)

internal fun TripBlogStatisticsDto.trend(range: Int, postId: String?): List<DailyBlogViews> {
    val firstTracked = posts.asSequence().flatMap { it.daily.asSequence() }.minOfOrNull { it.date }
        ?: return emptyList()
    val last = LocalDate.parse(today)
    val first = maxOf(LocalDate.parse(firstTracked), last.minusDays(range.toLong() - 1))
    val counts = mutableMapOf<LocalDate, Long>()
    posts.asSequence().filter { postId == null || it.id == postId }.flatMap { it.daily.asSequence() }
        .forEach { count ->
            val date = LocalDate.parse(count.date)
            counts[date] = counts.getOrDefault(date, 0L) + count.views
        }

    return generateSequence(first) { it.plusDays(1).takeUnless { next -> next.isAfter(last) } }
        .map { DailyBlogViews(it, counts.getOrDefault(it, 0L)) }
        .toList()
}

@HiltViewModel
class BlogStatisticsViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: TimelineRepository,
) : ViewModel() {
    private val tripId: String = checkNotNull(savedStateHandle["tripId"])
    private val _state = MutableStateFlow(BlogStatisticsState())
    internal val state = _state.asStateFlow()

    init { refresh() }

    fun refresh() {
        if (_state.value.loading) return
        _state.value = _state.value.copy(loading = true, failed = false)
        viewModelScope.launch {
            try {
                _state.value = BlogStatisticsState(data = repository.getTripBlogStatistics(tripId))
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                _state.value = _state.value.copy(loading = false, failed = true)
            }
        }
    }
}
